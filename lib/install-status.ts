// 설치 시작/완료 판정 + 팀즈 카드 발송(중복방지) — 사진 업로드/단말기없음 토글 양쪽에서 호출.
//
// 충족(satisfied) = 해당 슬롯에 사진이 있거나, na_slots(단말기 없음)에 포함됨.
//   - 설치 시작 = 설치전 7개 표준 슬롯(BEFORE_SLOTS) + 차량 이상유무 8종(CHECK_SLOTS,
//     사진 또는 check_na_slots '없음' 체크) 모두 충족
//   - 설치 완료 = 설치전 7 + 설치후 7 = 14개 표준 슬롯 모두 충족 (이상유무는 완료 판정 미포함)
// (커스텀 추가 슬롯은 시작/완료 판정에 포함하지 않음)
// 마이그레이션(migration_inspection.sql) 전 DB에서는 이상유무 조건을 건너뛴다(기존 동작 유지).

import { createServiceClient } from "@/lib/supabase/server";
import { BEFORE_SLOTS, AFTER_SLOTS, CHECK_SLOTS } from "@/lib/slots";
import { sendStartCard, sendCompletionCard } from "@/lib/teams";

type SB = ReturnType<typeof createServiceClient>;

export async function notifyInstallProgress(opts: {
  supabase: SB;
  plate: string;
  origin: string;
}): Promise<void> {
  const { supabase, plate, origin } = opts;

  // 이상유무 컬럼(check_*)이 아직 없는 DB면 기존 컬럼만으로 재시도(폴백)
  let recRes = await supabase
    .from("records")
    .select(
      "operator, route, team, na_slots, check_na_slots, check_note, extra_note, start_notified_at, complete_notified_at",
    )
    .eq("plate", plate)
    .maybeSingle();
  let hasCheckCols = true;
  if (recRes.error && /check_na_slots|check_note|extra_note/i.test(recRes.error.message)) {
    hasCheckCols = false;
    recRes = await supabase
      .from("records")
      .select("operator, route, team, na_slots, start_notified_at, complete_notified_at")
      .eq("plate", plate)
      .maybeSingle();
  }
  const rec = recRes.data as
    | {
        operator: string | null;
        route: string | null;
        team: string | null;
        na_slots: unknown;
        check_na_slots?: unknown;
        check_note?: string | null;
        extra_note?: string | null;
        start_notified_at: string | null;
        complete_notified_at: string | null;
      }
    | null;
  if (!rec) return;

  const na = new Set<string>(Array.isArray(rec.na_slots) ? (rec.na_slots as string[]) : []);
  const checkNa = new Set<string>(
    Array.isArray(rec.check_na_slots) ? (rec.check_na_slots as string[]) : [],
  );
  const [photosRes, checkRes] = await Promise.all([
    supabase
      .from("photos")
      .select("slot_key, storage_path, label, section, sort_order")
      .eq("plate", plate),
    supabase.from("check_photos").select("slot_key").eq("plate", plate),
  ]);
  const photoRows = photosRes.data;
  const present = new Set((photoRows ?? []).map((p) => p.slot_key));
  const checkPresent = new Set((checkRes.data ?? []).map((p) => p.slot_key));

  const satisfied = (slotKey: string) => present.has(slotKey) || na.has(slotKey);
  // 이상유무 조건 — 테이블/컬럼이 없는 DB(마이그레이션 전)면 통과 처리(알림 누락 방지)
  const checkOk =
    !hasCheckCols || checkRes.error
      ? true
      : CHECK_SLOTS.every((s) => checkPresent.has(s.slotKey) || checkNa.has(s.slotKey));
  const started = checkOk && BEFORE_SLOTS.every((s) => satisfied(s.slotKey));
  const completed =
    BEFORE_SLOTS.every((s) => satisfied(s.slotKey)) &&
    AFTER_SLOTS.every((s) => satisfied(s.slotKey));

  const operator = (rec.operator as string) ?? "";
  const route = (rec.route as string) ?? "";
  const team = (rec.team as string) ?? "";
  const checkNote = rec.check_note ?? ""; // 차량이상 비고 — 시작/완료 카드에 표시
  const extraNote = rec.extra_note ?? ""; // 특이사항 — 시작/완료 카드에 표시

  // 설치 시작 — 설치전 6칸 충족 & 아직 미발송
  if (started && !rec.start_notified_at) {
    try {
      await sendStartCard({ operator, plate, route, team, checkNote, extraNote });
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
      await sendCompletionCard({ operator, plate, route, team, checkNote, extraNote, photos });
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
