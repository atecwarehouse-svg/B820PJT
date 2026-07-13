import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { uploadPhoto, deletePhoto } from "@/lib/gdrive";
import { publicPhotoUrl } from "@/lib/photo-url";
import { checkPhotoRotation } from "@/lib/gemini";
import { runAfterResponse } from "@/lib/background";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 레코드가 없으면 최소 레코드를 생성 (사진 FK 충족). 운수사명을 함께 돌려줘 추가 조회를 없앤다.
async function ensureRecord(
  supabase: ReturnType<typeof createServiceClient>,
  plate: string,
): Promise<{ ok: boolean; operator: string }> {
  const { data: rec } = await supabase
    .from("records")
    .select("plate, operator")
    .eq("plate", plate)
    .maybeSingle();
  if (rec) return { ok: true, operator: (rec.operator as string) ?? "" };

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("operator, route")
    .eq("plate", plate)
    .maybeSingle();
  if (!vehicle) return { ok: false, operator: "" };

  await supabase.from("records").upsert(
    {
      plate,
      operator: vehicle.operator,
      route: vehicle.route,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "plate" },
  );
  return { ok: true, operator: (vehicle.operator as string) ?? "" };
}

// POST /api/photos  (multipart/form-data)
//   file, plate, section(before|after|check), slot_key, label, sort_order, is_custom
//   section="check" = 차량 이상유무 확인 사진 → check_photos 테이블 +
//   Drive의 차량 폴더 안 "차량이상유무(차량번호)" 하위 폴더에 저장 (PDF/엑셀·KPI 미포함)
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const plate = (form.get("plate") as string)?.trim();
  const section = form.get("section") as string;
  const slotKey = (form.get("slot_key") as string)?.trim();
  const label = (form.get("label") as string) ?? "";
  const sortOrder = Number(form.get("sort_order") ?? 0);
  const isCustom = form.get("is_custom") === "true";
  const isCheck = section === "check";

  if (!file || !plate || !slotKey || (section !== "before" && section !== "after" && !isCheck)) {
    return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
  }

  const table = isCheck ? "check_photos" : "photos";
  const supabase = createServiceClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  // 0) 회전 검사(Gemini)는 결과만 나중에 확인하면 되므로 DB 준비·Drive 업로드와 병렬 실행
  const rotPromise = checkPhotoRotation(buffer);

  // 레코드 확인(운수사 포함)과 기존 사진 조회를 병렬로
  const [recResult, existingRes] = await Promise.all([
    ensureRecord(supabase, plate),
    supabase
      .from(table)
      .select("storage_path")
      .eq("plate", plate)
      .eq("slot_key", slotKey)
      .maybeSingle(),
  ]);
  if (!recResult.ok) {
    return NextResponse.json(
      { error: "차량리스트에 없는 차량번호입니다." },
      { status: 404 },
    );
  }
  const operator = recResult.operator;
  const existing = existingRes.data;

  // 파일명: 설치전/후/차량이상유무_차량번호_칸라벨.jpg (라벨 없으면 슬롯키)
  const sectionKo = isCheck ? "차량이상유무" : section === "before" ? "설치전" : "설치후";
  const safeLabel = (label || slotKey).replace(/[\\/]/g, "-").trim();
  const fileName = `${sectionKo}_${plate}_${safeLabel}.jpg`;

  // 1) 새 Drive 파일 생성 (기존 파일은 아직 건드리지 않음)
  let fileId: string;
  try {
    fileId = await uploadPhoto({
      plate,
      operator,
      fileName,
      body: buffer,
      contentType: "image/jpeg",
      subfolder: isCheck ? `차량이상유무(${plate})` : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Google Drive 업로드 실패" },
      { status: 500 },
    );
  }

  // 1-a) 회전 검사 결과 확인 — 돌아간 사진이면 방금 올린 파일을 지우고 차단
  const rot = await rotPromise;
  if (rot.rotated) {
    await deletePhoto(fileId).catch(() => {});
    return NextResponse.json(
      { error: "사진이 회전되어 있습니다. 똑바로 다시 촬영해주세요." },
      { status: 422 },
    );
  }

  // 2) DB 저장 (새 파일 ID 기록) — check_photos에는 section/is_custom 컬럼 없음
  const row: Record<string, unknown> = {
    plate,
    slot_key: slotKey,
    label,
    storage_path: fileId, // Drive 파일 ID 저장
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  };
  if (!isCheck) {
    row.section = section;
    row.is_custom = isCustom;
  }
  const { error: dbErr, data } = await supabase
    .from(table)
    .upsert(row, { onConflict: "plate,slot_key" })
    .select("*")
    .single();

  // 2-a) DB 실패 → 방금 올린 새 파일 롤백(고아 방지). 기존 사진/DB는 그대로 유지됨.
  if (dbErr) {
    await deletePhoto(fileId).catch(() => {});
    const missing = isCheck && /check_photos/i.test(dbErr.message);
    return NextResponse.json(
      {
        error: missing
          ? "DB 준비가 안 됐습니다. supabase/migration_inspection.sql을 실행해주세요."
          : dbErr.message,
      },
      { status: 500 },
    );
  }

  // 3) 옛 파일 삭제는 응답을 먼저 돌려보낸 뒤 백그라운드로 처리 (best-effort)
  //    팀즈 시작/완료 알림은 사진 업로드가 아니라 '저장' 버튼(/api/records saved=true)에서 발송.
  const oldPath = existing?.storage_path as string | undefined;
  runAfterResponse(async () => {
    // DB 커밋 성공 후에야 옛 파일 삭제 (수정인 경우)
    if (oldPath && oldPath !== fileId) {
      await deletePhoto(oldPath).catch(() => {});
    }
  });

  return NextResponse.json({
    photo: data,
    url: `${publicPhotoUrl(fileId)}?t=${Date.now()}`,
  });
}

// DELETE /api/photos?plate=...&slot_key=...
// slot_key가 check_* 면 차량 이상유무 사진(check_photos)에서 삭제
export async function DELETE(req: NextRequest) {
  const plate = req.nextUrl.searchParams.get("plate")?.trim();
  const slotKey = req.nextUrl.searchParams.get("slot_key")?.trim();
  if (!plate || !slotKey) {
    return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
  }

  const table = slotKey.startsWith("check_") ? "check_photos" : "photos";
  const supabase = createServiceClient();
  const { data: photo } = await supabase
    .from(table)
    .select("storage_path")
    .eq("plate", plate)
    .eq("slot_key", slotKey)
    .maybeSingle();

  if (photo?.storage_path) {
    await deletePhoto(photo.storage_path).catch(() => {});
  }
  await supabase.from(table).delete().eq("plate", plate).eq("slot_key", slotKey);

  return NextResponse.json({ ok: true });
}
