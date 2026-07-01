// 설치 시작/완료 판정 + 팀즈 카드 발송(중복방지) — 사진 업로드/단말기없음 토글 양쪽에서 호출.
//
// 충족(satisfied) = 해당 슬롯에 사진이 있거나, na_slots(단말기 없음)에 포함됨.
//   - 설치 시작 = 설치전 6개 표준 슬롯(BEFORE_SLOTS) 모두 충족
//   - 설치 완료 = 설치전 6 + 설치후 7 = 13개 표준 슬롯 모두 충족
// (커스텀 추가 슬롯은 시작/완료 판정에 포함하지 않음 — 13장 기준 유지)

import { createServiceClient } from "@/lib/supabase/server";
import { BEFORE_SLOTS, AFTER_SLOTS } from "@/lib/slots";
import { sendStartCard, sendCompletionCard } from "@/lib/teams";

type SB = ReturnType<typeof createServiceClient>;

export async function notifyInstallProgress(opts: {
  supabase: SB;
  plate: string;
  origin: string;
}): Promise<void> {
  const { supabase, plate, origin } = opts;

  const { data: rec } = await supabase
    .from("records")
    .select("operator, route, team, na_slots, start_notified_at, complete_notified_at")
    .eq("plate", plate)
    .maybeSingle();
  if (!rec) return;

  const na = new Set<string>(Array.isArray(rec.na_slots) ? (rec.na_slots as string[]) : []);
  const { data: photoRows } = await supabase
    .from("photos")
    .select("slot_key, storage_path, label, section, sort_order")
    .eq("plate", plate);
  const present = new Set((photoRows ?? []).map((p) => p.slot_key));

  const satisfied = (slotKey: string) => present.has(slotKey) || na.has(slotKey);
  const started = BEFORE_SLOTS.every((s) => satisfied(s.slotKey));
  const completed = started && AFTER_SLOTS.every((s) => satisfied(s.slotKey));

  const operator = (rec.operator as string) ?? "";
  const route = (rec.route as string) ?? "";
  const team = (rec.team as string) ?? "";

  // 설치 시작 — 설치전 6칸 충족 & 아직 미발송
  if (started && !rec.start_notified_at) {
    try {
      await sendStartCard({ operator, plate, route, team });
    } catch {
      /* best-effort */
    }
    await supabase
      .from("records")
      .update({ start_notified_at: new Date().toISOString() })
      .eq("plate", plate);
  }

  // 설치 완료 — 13칸 충족 & 아직 미발송 (사진 첨부, na 칸은 제외)
  if (completed && !rec.complete_notified_at) {
    const photos = (photoRows ?? [])
      .filter((p) => p.storage_path && !na.has(p.slot_key))
      .sort((a, b) => {
        if (a.section !== b.section) return a.section === "before" ? -1 : 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      })
      .map((p) => ({
        url: `${origin}/api/photo/${encodeURIComponent(p.storage_path)}`,
        label: (p.label as string) ?? "",
      }));
    try {
      await sendCompletionCard({ operator, plate, route, team, photos });
    } catch {
      /* best-effort */
    }
    await supabase
      .from("records")
      .update({ complete_notified_at: new Date().toISOString() })
      .eq("plate", plate);
  }
}

// 요청 헤더에서 앱 공개 origin 추출 (Teams가 사진을 받아갈 절대 URL용)
export function originFromRequest(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}
