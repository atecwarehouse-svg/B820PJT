import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, PHOTOS_BUCKET } from "@/lib/supabase/server";
import { AFTER_SLOTS, buildBeforeSlots, type CustomSlot } from "@/lib/slots";
import { buildWorkbook, type SlotImage } from "@/lib/export/xlsx-builder";
import type { PhotoRow, RecordRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { plate: string } },
) {
  const plate = decodeURIComponent(params.plate).trim();
  const supabase = createServiceClient();

  const [vehicleRes, recordRes, photosRes] = await Promise.all([
    supabase.from("vehicles").select("plate, operator, route").eq("plate", plate).maybeSingle(),
    supabase.from("records").select("*").eq("plate", plate).maybeSingle(),
    supabase.from("photos").select("*").eq("plate", plate),
  ]);

  if (!vehicleRes.data) {
    return NextResponse.json({ error: "차량을 찾을 수 없습니다." }, { status: 404 });
  }
  const vehicle = vehicleRes.data;
  const record = recordRes.data as RecordRow | null;
  const photos = (photosRes.data as PhotoRow[]) ?? [];

  const customSlots: CustomSlot[] = record?.custom_slots ?? [];
  const beforeSlots = buildBeforeSlots(customSlots);
  const afterSlots = AFTER_SLOTS;

  // 사진 버퍼 다운로드
  const images = new Map<string, SlotImage>();
  await Promise.all(
    photos.map(async (p) => {
      const { data, error } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .download(p.storage_path);
      if (error || !data) return;
      const buf = Buffer.from(await data.arrayBuffer());
      images.set(p.slot_key, { buffer: buf, ext: "jpeg" });
    }),
  );

  const today = new Date();
  const installDate =
    record?.install_date ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const wb = await buildWorkbook({
    plate,
    installDate,
    operator: record?.operator ?? vehicle.operator,
    route: record?.route ?? vehicle.route,
    year: record?.year ?? "",
    model: record?.model ?? "",
    beforeSlots,
    afterSlots,
    images,
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  const filename = encodeURIComponent(`B820_설치사진첩_${plate}.xlsx`);

  return new NextResponse(arrayBuffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
