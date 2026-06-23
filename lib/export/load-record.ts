// 인쇄/PDF용 레코드 로더 — 차량/레코드/사진을 읽어 PrintData로 변환.

import { createServiceClient } from "@/lib/supabase/server";
import { downloadPhoto } from "@/lib/gdrive";
import { AFTER_SLOTS, buildBeforeSlots, type CustomSlot } from "@/lib/slots";
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

  // PDF는 puppeteer가 origin 없이(setContent) 렌더링하므로 상대 URL이 안 먹는다.
  // 사진을 직접 내려받아 base64 data URI로 박아 넣는다(인쇄 페이지에서도 동일하게 동작).
  const urlBySlot = new Map<string, string>();
  await Promise.all(
    photos.map(async (p) => {
      try {
        const buf = await downloadPhoto(p.storage_path);
        urlBySlot.set(p.slot_key, `data:image/jpeg;base64,${buf.toString("base64")}`);
      } catch {
        // 누락 사진은 건너뜀
      }
    }),
  );

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

// 여러 차량을 한번에 (입력 plate 순서 유지, 없는 차량은 제외)
export async function loadManyPrintData(plates: string[]): Promise<PrintData[]> {
  const results = await Promise.all(plates.map((p) => loadPrintData(p.trim())));
  return results.filter((d): d is PrintData => d !== null);
}
