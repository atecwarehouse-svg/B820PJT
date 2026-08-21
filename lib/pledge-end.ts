// 안전관리 서약서 세션 종료 — 수동('설치 종료' 버튼)과 자동(금일 설치 완료) 공용.

import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll, chunk } from "@/lib/supabase/paginate";
import { BEFORE_SLOTS, AFTER_SLOTS } from "@/lib/slots";
import { loadTodayExcludedPlates } from "@/lib/stats";
import { workDateString } from "@/lib/work-day";

type SB = ReturnType<typeof createServiceClient>;

const STD_SLOTS = [...BEFORE_SLOTS, ...AFTER_SLOTS].map((s) => s.slotKey);

// 현재 시각 KST HH:mm
export function kstHm(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// 수동 '설치 종료' 시각(KST HH:mm) — 상한은 설치일 다음날 05:30.
// 종료 버튼을 다음 날 낮에 눌러도 서약서에는 작업이 끝난 시각(05:30)까지만 적힌다.
export function endHm(installDate: string, now: Date = new Date()): string {
  const limit = Date.parse(`${installDate}T20:30:00Z`); // = 설치일 다음날 05:30 KST
  if (Number.isFinite(limit) && now.getTime() > limit) return "05:30";
  return kstHm(now);
}

// 금일 설치 완료 = 금일 예정 차량이 전부 '설치완료' 또는 '배차표 설치제외'.
// (완료 판정은 대시보드와 같은 기준 — 표준 14칸이 사진 또는 '없음' 체크로 충족 + 저장됨)
export async function todayInstallDone(supabase: SB, date: string): Promise<boolean> {
  const planned = await fetchAll<{ plate: string }>((from, to) =>
    supabase
      .from("vehicles")
      .select("plate")
      .eq("planned_date", date)
      .order("plate")
      .range(from, to),
  );
  const plates = planned.map((v) => v.plate).filter(Boolean);
  if (!plates.length) return false; // 금일 예정이 없으면 판정하지 않는다
  const excluded = new Set(await loadTodayExcludedPlates(date));
  const targets = plates.filter((p) => !excluded.has(p));

  for (const part of chunk(targets)) {
    const [recs, photos] = await Promise.all([
      supabase.from("records").select("plate, saved_at, na_slots").in("plate", part),
      fetchAll<{ plate: string; slot_key: string }>((from, to) =>
        supabase
          .from("photos")
          .select("plate, slot_key")
          .in("plate", part)
          .in("slot_key", STD_SLOTS)
          .order("id")
          .range(from, to),
      ),
    ]);
    if (recs.error) return false; // 조회 실패는 '미완료'로 — 다음 저장 때 다시 판정
    const bySlot = new Map<string, Set<string>>();
    for (const p of photos) {
      const s = bySlot.get(p.plate) ?? new Set<string>();
      s.add(p.slot_key);
      bySlot.set(p.plate, s);
    }
    for (const plate of part) {
      const rec = (recs.data ?? []).find((r) => r.plate === plate);
      if (!rec?.saved_at) return false;
      const na = new Set<string>(Array.isArray(rec.na_slots) ? rec.na_slots : []);
      const have = bySlot.get(plate);
      if (!STD_SLOTS.every((k) => have?.has(k) || na.has(k))) return false;
    }
  }
  return true;
}

// 금일 설치가 다 끝나면 그 업무일의 열린 서약서 세션을 자동 종료한다
// (= 그 시점부터 작업자의 '설치 후' 서명이 열린다). 차량 저장 후 백그라운드로 호출.
export async function autoEndPledgeSessions(supabase: SB): Promise<void> {
  const date = workDateString(new Date());
  const { data: sessions, error } = await supabase
    .from("pledge_sessions")
    .select("id, install_date")
    .eq("install_date", date)
    .is("ended_at", null);
  if (error || !sessions?.length) return;
  if (!(await todayInstallDone(supabase, date))) return;

  const now = new Date();
  for (const s of sessions) {
    await supabase
      .from("pledge_sessions")
      // 자동 종료 시각은 실제 종료된 시각 그대로
      .update({ ended_at: now.toISOString(), end_time: kstHm(now) })
      .eq("id", s.id)
      .is("ended_at", null); // 그 사이 수동 종료됐으면 그대로 둔다
  }
}
