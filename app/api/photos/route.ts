import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { uploadPhoto, deletePhoto, downloadPhoto } from "@/lib/gdrive";
import { publicPhotoUrl } from "@/lib/photo-url";
import { checkPhotoRotation, comparePhotoToReference } from "@/lib/gemini";
import { sendStartCard, sendCompletionCard } from "@/lib/teams";
import { BEFORE_SLOTS, DEFAULT_PHOTO_COUNT } from "@/lib/slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 레코드가 없으면 최소 레코드를 생성 (사진 FK 충족)
async function ensureRecord(
  supabase: ReturnType<typeof createServiceClient>,
  plate: string,
) {
  const { data: rec } = await supabase
    .from("records")
    .select("plate")
    .eq("plate", plate)
    .maybeSingle();
  if (rec) return true;

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("operator, route")
    .eq("plate", plate)
    .maybeSingle();
  if (!vehicle) return false;

  await supabase.from("records").upsert(
    {
      plate,
      operator: vehicle.operator,
      route: vehicle.route,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "plate" },
  );
  return true;
}

// POST /api/photos  (multipart/form-data)
//   file, plate, section, slot_key, label, sort_order, is_custom
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const plate = (form.get("plate") as string)?.trim();
  const section = form.get("section") as string;
  const slotKey = (form.get("slot_key") as string)?.trim();
  const label = (form.get("label") as string) ?? "";
  const sortOrder = Number(form.get("sort_order") ?? 0);
  const isCustom = form.get("is_custom") === "true";

  if (!file || !plate || !slotKey || (section !== "before" && section !== "after")) {
    return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const ok = await ensureRecord(supabase, plate);
  if (!ok) {
    return NextResponse.json(
      { error: "차량리스트에 없는 차량번호입니다." },
      { status: 404 },
    );
  }

  // 폴더 구조(운수사/차량번호) + 팀즈 카드용 운수사/노선을 가져온다.
  const { data: rec } = await supabase
    .from("records")
    .select("operator, route")
    .eq("plate", plate)
    .maybeSingle();
  const operator = (rec?.operator as string) ?? "";
  const route = (rec?.route as string) ?? "";

  // 같은 칸을 다시 찍으면 기존 Drive 파일 내용을 갱신(파일 ID 유지).
  const { data: existing } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("plate", plate)
    .eq("slot_key", slotKey)
    .maybeSingle();

  const arrayBuffer = await file.arrayBuffer();

  const buffer = Buffer.from(arrayBuffer);

  // 0) 회전 검사 (Gemini): 돌아간 사진이면 Drive/DB 저장 전에 차단
  const rot = await checkPhotoRotation(buffer);
  if (rot.rotated) {
    return NextResponse.json(
      { error: "사진이 회전되어 있습니다. 똑바로 다시 촬영해주세요." },
      { status: 422 },
    );
  }

  // 0-b) 기준사진 비교 (있을 때만): 칸의 기준사진과 다른 대상이면 차단
  const { data: ref } = await supabase
    .from("reference_photos")
    .select("storage_path")
    .eq("slot_key", slotKey)
    .maybeSingle();
  if (ref?.storage_path) {
    try {
      const refBuf = await downloadPhoto(ref.storage_path);
      const cmp = await comparePhotoToReference(buffer, refBuf, label);
      if (!cmp.match) {
        return NextResponse.json(
          { error: "기준 사진과 다른 사진 같습니다. 올바른 칸·대상인지 확인 후 다시 촬영해주세요." },
          { status: 422 },
        );
      }
    } catch {
      // 기준사진 다운로드 실패 등은 통과(fail-open)
    }
  }

  // 파일명: 설치전/후_차량번호_칸라벨.jpg (라벨 없으면 슬롯키)
  const sectionKo = section === "before" ? "설치전" : "설치후";
  const safeLabel = (label || slotKey).replace(/[\\/]/g, "-").trim();
  const fileName = `${sectionKo}_${plate}_${safeLabel}.jpg`;

  // 1) 새 Drive 파일 생성 (기존 파일은 아직 건드리지 않음)
  let fileId: string;
  try {
    fileId = await uploadPhoto({
      plate,
      operator,
      fileName,
      body: Buffer.from(arrayBuffer),
      contentType: "image/jpeg",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Google Drive 업로드 실패" },
      { status: 500 },
    );
  }

  // 2) DB 저장 (새 파일 ID 기록)
  const { error: dbErr, data } = await supabase
    .from("photos")
    .upsert(
      {
        plate,
        section,
        slot_key: slotKey,
        label,
        storage_path: fileId, // Drive 파일 ID 저장
        sort_order: sortOrder,
        is_custom: isCustom,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "plate,slot_key" },
    )
    .select("*")
    .single();

  // 2-a) DB 실패 → 방금 올린 새 파일 롤백(고아 방지). 기존 사진/DB는 그대로 유지됨.
  if (dbErr) {
    await deletePhoto(fileId).catch(() => {});
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  // 3) DB 커밋 성공 후에야 옛 파일 삭제 (수정인 경우, best-effort)
  if (existing?.storage_path && existing.storage_path !== fileId) {
    await deletePhoto(existing.storage_path).catch(() => {});
  }

  // 4) 팀즈 알림 — '새 사진'(재촬영 아님)이 임계값을 넘기는 순간에만 발송.
  //    설치전 6장 완료 → '설치 시작', 전체 13장 완료 → '설치 완료'(사진 첨부).
  //    best-effort: 발송 실패해도 업로드는 성공으로 처리.
  if (!existing) {
    try {
      const beforeTarget = BEFORE_SLOTS.length; // 6
      const [{ count: totalCount }, { count: beforeCount }] = await Promise.all([
        supabase.from("photos").select("plate", { count: "exact", head: true }).eq("plate", plate),
        supabase
          .from("photos")
          .select("plate", { count: "exact", head: true })
          .eq("plate", plate)
          .eq("section", "before"),
      ]);

      // 설치 시작: 설치전 사진이 막 6장이 된 경우
      if (section === "before" && beforeCount === beforeTarget) {
        await sendStartCard({ operator, plate, route });
      }

      // 설치 완료: 전체 사진이 막 13장이 된 경우 → 사진 첨부
      if (totalCount === DEFAULT_PHOTO_COUNT) {
        const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
        const proto = req.headers.get("x-forwarded-proto") ?? "https";
        const origin = host ? `${proto}://${host}` : req.nextUrl.origin;
        const { data: photoRows } = await supabase
          .from("photos")
          .select("storage_path, label, section, sort_order")
          .eq("plate", plate);
        const photos = (photoRows ?? [])
          .sort((a, b) => {
            if (a.section !== b.section) return a.section === "before" ? -1 : 1;
            return (a.sort_order ?? 0) - (b.sort_order ?? 0);
          })
          .filter((p) => p.storage_path)
          .map((p) => ({
            url: `${origin}/api/photo/${encodeURIComponent(p.storage_path)}`,
            label: (p.label as string) ?? "",
          }));
        await sendCompletionCard({ operator, plate, route, photos });
      }
    } catch {
      // 알림 실패는 무시 (업로드 유지)
    }
  }

  return NextResponse.json({
    photo: data,
    url: `${publicPhotoUrl(fileId)}?t=${Date.now()}`,
  });
}

// DELETE /api/photos?plate=...&slot_key=...
export async function DELETE(req: NextRequest) {
  const plate = req.nextUrl.searchParams.get("plate")?.trim();
  const slotKey = req.nextUrl.searchParams.get("slot_key")?.trim();
  if (!plate || !slotKey) {
    return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: photo } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("plate", plate)
    .eq("slot_key", slotKey)
    .maybeSingle();

  if (photo?.storage_path) {
    await deletePhoto(photo.storage_path).catch(() => {});
  }
  await supabase.from("photos").delete().eq("plate", plate).eq("slot_key", slotKey);

  return NextResponse.json({ ok: true });
}
