import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { uploadPhoto, deletePhoto } from "@/lib/gdrive";
import { publicPhotoUrl } from "@/lib/photo-url";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 기준사진 Drive 보관 위치: 루트/기준사진/공통/기준_{slotKey}.jpg
const REF_OPERATOR = "기준사진";
const REF_PLATE = "공통";

// POST /api/admin/reference  (multipart: slot_key, section, label, file)  → 기준사진 등록/교체
export async function POST(req: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const slotKey = (form.get("slot_key") as string)?.trim();
  const section = form.get("section") as string;
  const label = ((form.get("label") as string) ?? "").trim();
  if (!file || !slotKey) {
    return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("reference_photos")
    .select("storage_path")
    .eq("slot_key", slotKey)
    .maybeSingle();

  const arrayBuffer = await file.arrayBuffer();
  let fileId: string;
  try {
    fileId = await uploadPhoto({
      plate: REF_PLATE,
      operator: REF_OPERATOR,
      fileName: `기준_${slotKey}.jpg`,
      body: Buffer.from(arrayBuffer),
      contentType: "image/jpeg",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Drive 업로드 실패" },
      { status: 500 },
    );
  }

  const { error: dbErr } = await supabase.from("reference_photos").upsert(
    {
      slot_key: slotKey,
      section,
      label,
      storage_path: fileId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "slot_key" },
  );
  if (dbErr) {
    await deletePhoto(fileId).catch(() => {});
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  // 교체면 기존 Drive 파일 삭제
  if (existing?.storage_path && existing.storage_path !== fileId) {
    await deletePhoto(existing.storage_path).catch(() => {});
  }

  return NextResponse.json({ url: `${publicPhotoUrl(fileId)}?t=${Date.now()}` });
}

// DELETE /api/admin/reference?slot_key=...  → 기준사진 삭제(Drive + DB)
export async function DELETE(req: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const slotKey = req.nextUrl.searchParams.get("slot_key")?.trim();
  if (!slotKey) {
    return NextResponse.json({ error: "slot_key 누락" }, { status: 400 });
  }
  const supabase = createServiceClient();
  const { data: ref } = await supabase
    .from("reference_photos")
    .select("storage_path")
    .eq("slot_key", slotKey)
    .maybeSingle();
  if (ref?.storage_path) {
    await deletePhoto(ref.storage_path).catch(() => {});
  }
  await supabase.from("reference_photos").delete().eq("slot_key", slotKey);
  return NextResponse.json({ ok: true });
}
