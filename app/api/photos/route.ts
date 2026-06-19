import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, PHOTOS_BUCKET } from "@/lib/supabase/server";
import { storageKey } from "@/lib/storage-path";

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

  const storagePath = storageKey(plate, section, slotKey);
  const arrayBuffer = await file.arrayBuffer();

  const { error: upErr } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { error: dbErr, data } = await supabase
    .from("photos")
    .upsert(
      {
        plate,
        section,
        slot_key: slotKey,
        label,
        storage_path: storagePath,
        sort_order: sortOrder,
        is_custom: isCustom,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "plate,slot_key" },
    )
    .select("*")
    .single();
  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  const { data: pub } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(storagePath);
  return NextResponse.json({ photo: data, url: `${pub.publicUrl}?t=${Date.now()}` });
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
    await supabase.storage.from(PHOTOS_BUCKET).remove([photo.storage_path]);
  }
  await supabase.from("photos").delete().eq("plate", plate).eq("slot_key", slotKey);

  return NextResponse.json({ ok: true });
}
