import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { uploadPhoto, deletePhoto } from "@/lib/gdrive";
import { publicPhotoUrl } from "@/lib/photo-url";

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

  // 폴더 구조(운수사/차량번호)를 위해 운수사명을 가져온다.
  const { data: rec } = await supabase
    .from("records")
    .select("operator")
    .eq("plate", plate)
    .maybeSingle();
  const operator = (rec?.operator as string) ?? "";

  // 같은 칸을 다시 찍으면 기존 Drive 파일 내용을 갱신(파일 ID 유지).
  const { data: existing } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("plate", plate)
    .eq("slot_key", slotKey)
    .maybeSingle();

  const arrayBuffer = await file.arrayBuffer();

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
