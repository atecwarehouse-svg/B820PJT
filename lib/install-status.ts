// 설치 시작/완료 판정 + 팀즈 카드 발송 — '저장' 버튼(records saved=true)에서만 호출.
// (사진 장수 충족 시 자동 발송하던 방식은 2026-07-13 폐기 — 저장을 눌러야 발송)
//
// 충족(satisfied) = 해당 슬롯에 사진이 있거나, na_slots(단말기 없음)에 포함됨.
//   - 설치 시작 = 설치전 7개 표준 슬롯(BEFORE_SLOTS) + 차량 이상유무 8종(CHECK_SLOTS,
//     사진 또는 check_na_slots '없음' 체크) 모두 충족
//   - 설치 완료 = 설치전 7 + 설치후 7 = 14개 표준 슬롯 모두 충족 (이상유무는 완료 판정 미포함)
// (커스텀 추가 슬롯은 시작/완료 판정에 포함하지 않음)
//
// 재발송: 카드 내용 지문(sig — 사진·비고·특이사항·팀명 등)을 records에 기록해두고,
// 다시 저장했을 때 지문이 달라졌으면(수정사항 있음) 같은 카드를 다시 보낸다.
// 완료 조건까지 충족되면 완료 카드만 보낸다(시작 카드 재발송 생략).
//
// 마이그레이션(migration_inspection.sql) 전 DB에서는 이상유무 조건을 건너뛰고
// 발송 여부도 기존처럼 *_notified_at 1회 기준으로 판정한다(폴백).

import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { BEFORE_SLOTS, AFTER_SLOTS, CHECK_SLOTS } from "@/lib/slots";
import { sendStartCard, sendCompletionCard } from "@/lib/teams";

type SB = ReturnType<typeof createServiceClient>;

const fingerprint = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");

export async function notifyInstallProgress(opts: {
  supabase: SB;
  plate: string;
  origin: string;
}): Promise<void> {
  const { supabase, plate, origin } = opts;

  // 이상유무·지문 컬럼이 아직 없는 DB면 기존 컬럼만으로 재시도(폴백)
  let recRes = await supabase
    .from("records")
    .select(
      "operator, route, team, na_slots, check_na_slots, check_note, extra_note, start_notified_at, complete_notified_at, start_notified_sig, complete_notified_sig",
    )
    .eq("plate", plate)
    .maybeSingle();
  let hasCheckCols = true;
  if (
    recRes.error &&
    /check_na_slots|check_note|extra_note|notified_sig/i.test(recRes.error.message)
  ) {
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
        start_notified_sig?: string | null;
        complete_notified_sig?: string | null;
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
    supabase.from("check_photos").select("slot_key, storage_path").eq("plate", plate),
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

  // 카드 내용 지문 — 사진(파일ID)·없음체크·비고·특이사항·팀명·운수사·노선이 바뀌면 달라진다.
  const slotIds = (rows: { slot_key: string; storage_path?: string | null }[] | null) =>
    (rows ?? [])
      .map((p) => `${p.slot_key}:${p.storage_path ?? ""}`)
      .sort();
  const header = { operator, route, team, checkNote, extraNote };
  const beforeIds = slotIds(
    (photoRows ?? []).filter((p) => p.section === "before"),
  );
  const startSig = fingerprint({
    ...header,
    before: beforeIds,
    check: slotIds(checkRes.data ?? []),
    na: [...na].filter((k) => k.startsWith("before")).sort(),
    checkNa: [...checkNa].sort(),
  });
  const completeSig = fingerprint({
    ...header,
    photos: slotIds(photoRows ?? []),
    na: [...na].sort(),
  });

  // 발송 시각·지문 기록 (지문 컬럼 없는 DB면 시각만)
  const stamp = async (fields: Record<string, string>) => {
    let r = await supabase.from("records").update(fields).eq("plate", plate);
    if (r.error && /notified_sig/i.test(r.error.message)) {
      const timesOnly = Object.fromEntries(
        Object.entries(fields).filter(([k]) => k.endsWith("_at")),
      );
      r = await supabase.from("records").update(timesOnly).eq("plate", plate);
    }
  };

  // 재발송 판정: 지문 컬럼이 있으면 "지문이 달라졌을 때"(최초 포함), 없으면 최초 1회만.
  const shouldSend = (sentAt: string | null, savedSig: string | null | undefined, sig: string) =>
    hasCheckCols ? savedSig !== sig : !sentAt;

  // 설치 완료 — 14칸 충족: 완료 카드만 발송(시작 카드 재발송 생략)
  if (completed) {
    if (!shouldSend(rec.complete_notified_at, rec.complete_notified_sig, completeSig)) return;
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
      return; // 발송 실패 시 지문 미기록 → 다음 저장 때 재시도
    }
    await stamp({
      complete_notified_at: new Date().toISOString(),
      complete_notified_sig: completeSig,
    });
    return;
  }

  // 설치 시작 — 설치전 7칸 + 이상유무 8칸 충족
  if (started) {
    if (!shouldSend(rec.start_notified_at, rec.start_notified_sig, startSig)) return;
    try {
      await sendStartCard({ operator, plate, route, team, checkNote, extraNote });
    } catch {
      return; // 발송 실패 시 지문 미기록 → 다음 저장 때 재시도
    }
    await stamp({
      start_notified_at: new Date().toISOString(),
      start_notified_sig: startSig,
    });
  }
}

// 요청 헤더에서 앱 공개 origin 추출 (Teams가 사진을 받아갈 절대 URL용)
export function originFromRequest(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}
