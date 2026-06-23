// 엑셀 생성용 BuildInput 로더 — 차량/레코드/사진(버퍼 다운로드)을 모은다.
// 단일/일괄 엑셀 export 라우트가 공유.

import { createServiceClient } from "@/lib/supabase/server";
import { downloadPhoto } from "@/lib/gdrive";
import { AFTER_SLOTS, buildBeforeSlots, type CustomSlot } from "@/lib/slots";
import type { PhotoRow, RecordRow } from "@/lib/types";
import type { BuildInput, SlotImage } from "@/lib/export/xlsx-builder";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function loadBuildInput(plate: string): Promise<BuildInput | null> {
  const supabase = createServiceClient();
  const [vehicleRes, recordRes, photosRes] = await Promise.all([
    supabase.from("vehicles").select("plate, operator, route").eq("plate", plate).maybeSingle(),
    supabase.from("records").select("*").eq("plate", plate).maybeSingle(),
    supabase.from("photos").select("*").eq("plate", plate),
  ]);

  const vehicle = vehicleRes.data;
  if (!vehicle) return null;
  const record = recordRes.data as RecordRow | null;
  const photos = (photosRes.data as PhotoRow[]) ?? [];

  const customSlots: CustomSlot[] = record?.custom_slots ?? [];
  const beforeSlots = buildBeforeSlots(customSlots);

  const images = new Map<string, SlotImage>();
  await Promise.all(
    photos.map(async (p) => {
      try {
        const buf = await downloadPhoto(p.storage_path);
        images.set(p.slot_key, { buffer: buf, ext: "jpeg" });
      } catch {
        // 누락 사진은 건너뜀
      }
    }),
  );

  return {
    plate,
    installDate: record?.install_date ?? todayStr(),
    operator: record?.operator ?? vehicle.operator,
    route: record?.route ?? vehicle.route,
    year: record?.year ?? "",
    model: record?.model ?? "",
    beforeSlots,
    afterSlots: AFTER_SLOTS,
    images,
  };
}
