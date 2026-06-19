// 인쇄/PDF용 레코드 로더 — 차량/레코드/사진을 읽어 PrintData로 변환.

import { createServiceClient } from "@/lib/supabase/server";
import { AFTER_SLOTS, buildBeforeSlots, type CustomSlot } from "@/lib/slots";
import { publicPhotoUrl } from "@/lib/photo-url";
import type { PhotoRow, RecordRow } from "@/lib/types";
import type { PrintData } from "@/lib/export/print-html";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function loadPrintData(plate: string): Promise<PrintData | null> {
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

  const urlBySlot = new Map<string, string>();
  for (const p of photos) {
    urlBySlot.set(p.slot_key, `${publicPhotoUrl(p.storage_path)}?t=${p.updated_at ?? ""}`);
  }

  const customSlots: CustomSlot[] = record?.custom_slots ?? [];
  const beforeSlots = buildBeforeSlots(customSlots);

  const toSlots = (slots: typeof beforeSlots) =>
    slots.map((s) => ({ label: s.label, url: urlBySlot.get(s.slotKey) ?? null }));

  return {
    plate,
    installDate: record?.install_date ?? todayStr(),
    operator: record?.operator ?? vehicle.operator,
    route: record?.route ?? vehicle.route,
    year: record?.year ?? "",
    model: record?.model ?? "",
    sections: [
      { title: "설치 전", slots: toSlots(beforeSlots) },
      { title: "설치 후", slots: toSlots(AFTER_SLOTS) },
    ],
  };
}
