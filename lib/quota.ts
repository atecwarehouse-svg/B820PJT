// 수량 차감 방식(quota_mode) — 운수사와 날짜별 '수량'만 합의하고 어떤 차량을 설치할지는
// 그날 들어오는 차량으로 정하는 프로젝트(공항버스)용.
// 앱의 금일 대상·리포트·달력·엑셀은 전부 vehicles.planned_date(차량별 예정일)를 읽으므로,
// 읽는 쪽은 그대로 두고 예정일이 현장 실제를 따라가게 맞춘다.
//   settle  — 차량 작업 시작·완료 시 그 차량의 예정일을 오늘로. 오늘 예정·미착수 차량이 있으면
//             (같은 운수사 먼저, 없으면 같은 회사의 다른 영업소) 자리를 바꿔 일자별 수량 유지,
//             오늘 예정이 전부 착수됐으면 원래 날짜(미래) 수량에서 1대 차감.
//   carry   — 지난 날짜에 남은 미완료 차량은 그 운수사의 오늘 이후 가장 가까운 예정일로 이월.
// vehicles 부분 갱신은 반드시 update().in()/eq() — upsert는 operator not-null에 걸린다.
import { createServiceClient } from "@/lib/supabase/server";
import { chunk, fetchAll } from "@/lib/supabase/paginate";
import { getSetting, isQuotaMode, setSetting } from "@/lib/settings";
import { workDateString } from "@/lib/work-day";
import { companyOf } from "@/lib/route-dispatch";

type SB = ReturnType<typeof createServiceClient>;
export type Move = { plate: string; from: string | null; to: string };
type Opts = { dryRun?: boolean };

/** 오늘 이후(오늘 포함) 가장 가까운 예정일. 없으면 null */
export function nextDateFor(dates: Iterable<string>, today: string): string | null {
  let best: string | null = null;
  for (const d of dates) if (d >= today && (best === null || d < best)) best = d;
  return best;
}

/**
 * 자리를 바꿀 후보 순서 — 오늘 예정·미착수(records 없음) 차량을 차량번호 순으로.
 * 같은 운수사(sameOp, 생략 시 같은 운수사로 봄)가 먼저, 그다음 같은 회사의 다른 영업소 —
 * 오늘 예정에 없던 영업소 차량이 들어와도 금일 계획수량이 늘지 않게 한다.
 */
export function swapOrder(
  candidates: { plate: string; started: boolean; sameOp?: boolean }[],
  self: string,
): string[] {
  const free = candidates.filter((c) => c.plate !== self && !c.started);
  const of = (same: boolean) => free.filter((c) => (c.sameOp !== false) === same).map((c) => c.plate).sort();
  return [...of(true), ...of(false)];
}

/** 자리를 바꿀 후보 첫 대(없으면 null) */
export function pickSwap(
  candidates: { plate: string; started: boolean; sameOp?: boolean }[],
  self: string,
): string | null {
  return swapOrder(candidates, self)[0] ?? null;
}

const ymd = (v: unknown) => (v ? String(v).slice(0, 10) : null);

// ── 원본 계획(합의 수량) ──
// 예정일을 실제 설치일로 옮기므로 지난 날짜의 예정일 대수는 실적과 같아진다 — 그걸 계획으로 읽으면
// 리포트 '누적 계획'이 실적을 따라 바뀐다(11/13 계획 20대 → 22대, 누적 28대 → 30대).
// 그래서 날짜별 계획 대수를 따로 보관한다: 일정 업로드가 파일 날짜 그대로 저장하고,
// 설치 일정변경(차량 이동)이 옮긴 만큼 조정한다. 예정일 재배정·이월은 이 값을 건드리지 않는다.
export const PLAN_DAYS_KEY = "plan_days"; // app_settings JSON {"YYYY-MM-DD": 대수}
export type PlanDays = Record<string, number>;

/** 예정일 목록 → 날짜별 대수(예정일 없는 차량 제외) */
export function countPlan(dates: Iterable<string | null | undefined>): PlanDays {
  const out: PlanDays = {};
  for (const d of dates) if (d) out[d.slice(0, 10)] = (out[d.slice(0, 10)] ?? 0) + 1;
  return out;
}

/**
 * 일정 업로드 시 보관할 계획 — 오늘 이후는 올린 파일, 지난 날짜는 이전 보관값을 유지한다.
 * 내려받은 진행현황 엑셀(지난 날짜 예정일 = 실제 설치일)을 고쳐 다시 올려도 지난 계획이 실적으로 덮이지 않게.
 */
export function mergePlan(prev: PlanDays | null, file: PlanDays, today: string): PlanDays {
  if (!prev) return file;
  const pick = (p: PlanDays, keep: (d: string) => boolean) => Object.entries(p).filter(([d]) => keep(d));
  return Object.fromEntries([...pick(prev, (d) => d < today), ...pick(file, (d) => d >= today)]);
}

/** 설치 일정변경 — 차량을 옮긴 만큼 계획 대수도 옮긴다(from: 옮기기 전 예정일들) */
export function shiftPlan(plan: PlanDays, from: Iterable<string | null | undefined>, to: string): PlanDays {
  const out = { ...plan };
  for (const f of from) {
    const d = f?.slice(0, 10);
    if (d === to) continue;
    if (d && out[d]) out[d] > 1 ? out[d]-- : delete out[d];
    out[to] = (out[to] ?? 0) + 1;
  }
  return out;
}

/** 보관된 원본 계획(없거나 깨졌으면 null — 읽는 쪽은 예정일 대수로 폴백) */
export async function getPlanDays(slug?: string): Promise<PlanDays | null> {
  try {
    const v = JSON.parse((await getSetting(PLAN_DAYS_KEY, slug)) ?? "null");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as PlanDays) : null;
  } catch {
    return null;
  }
}

export const savePlanDays = (plan: PlanDays, slug?: string) => setSetting(PLAN_DAYS_KEY, JSON.stringify(plan), slug);

async function platesWithRecords(sb: SB, plates: string[], onlyCompleted: boolean): Promise<Set<string>> {
  const out = new Set<string>();
  for (const part of chunk(plates)) {
    const { data, error } = await sb.from("records").select("plate, saved_at").in("plate", part);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { plate: string; saved_at: string | null }[]) {
      if (!onlyCompleted || r.saved_at) out.add(r.plate);
    }
  }
  return out;
}

async function setDates(sb: SB, plates: string[], date: string): Promise<void> {
  for (const part of chunk(plates)) {
    const { error } = await sb.from("vehicles").update({ planned_date: date }).in("plate", part);
    if (error) throw new Error(error.message);
  }
}

/** 이월 — 과거 예정·미완료 차량을 운수사의 다음 예정일로. operator를 주면 그 운수사만. */
export async function carryOverQuota(sb: SB, today: string, operator?: string, opts: Opts = {}): Promise<Move[]> {
  const vehicles = await fetchAll<{ plate: string; operator: string | null; planned_date: string }>((from, to) => {
    let q = sb.from("vehicles").select("plate, operator, planned_date").not("planned_date", "is", null).order("plate");
    if (operator !== undefined) q = q.eq("operator", operator);
    return q.range(from, to);
  });
  const byOp = new Map<string, { dates: Set<string>; overdue: { plate: string; date: string }[] }>();
  for (const v of vehicles) {
    const d = ymd(v.planned_date)!;
    const op = v.operator ?? "";
    const o = byOp.get(op) ?? { dates: new Set<string>(), overdue: [] };
    o.dates.add(d);
    if (d < today) o.overdue.push({ plate: v.plate, date: d });
    byOp.set(op, o);
  }
  const moves: Move[] = [];
  for (const o of byOp.values()) {
    if (!o.overdue.length) continue;
    const next = nextDateFor(o.dates, today);
    if (!next) continue; // 남은 예정일이 없는 운수사 — 그대로 미설치로 둔다
    const done = await platesWithRecords(sb, o.overdue.map((x) => x.plate), true);
    const pending = o.overdue.filter((x) => !done.has(x.plate));
    if (!pending.length) continue;
    if (!opts.dryRun) await setDates(sb, pending.map((x) => x.plate), next);
    moves.push(...pending.map((x) => ({ plate: x.plate, from: x.date, to: next })));
  }
  return moves;
}

/** 차량 작업 시작·완료 — 예정일을 오늘로 끌어온다(자리 교환 또는 수량 차감). 이월도 함께 처리. */
export async function settleQuota(sb: SB, plate: string, today: string, opts: Opts = {}): Promise<Move[]> {
  const sel = (cols: string) => sb.from("vehicles").select(cols).eq("plate", plate).maybeSingle();
  let { data: v, error } = await sel("plate, operator, planned_date, is_added");
  if (error && /is_added/i.test(error.message)) ({ data: v, error } = await sel("plate, operator, planned_date")); // 옛 DB 폴백
  if (error) throw new Error(error.message);
  if (!v) return [];
  const veh = v as unknown as { operator: string | null; planned_date: string | null; is_added?: boolean | null };
  if (veh.is_added) return []; // 증차 차량은 합의 수량 밖 — 다른 집계와 같이 예정일 없이 둔다
  const op = veh.operator ?? "";
  const moves = await carryOverQuota(sb, today, op, opts);
  // 이월이 이 차량도 옮겼으면(지난 날짜 예정) 옮긴 뒤 날짜가 현재값 — 옛 날짜로 남을 자리를 교환하면 안 됨
  let cur = ymd(veh.planned_date);
  const mine = moves.find((m) => m.plate === plate);
  if (mine) cur = mine.to;
  if (cur === today) return moves;

  // 자리 교환은 내 예정일이 미래일 때만 — 과거 날짜(남은 예정일이 없어 이월 못 한 경우)로 다른 차량을 보내지 않는다
  let order: string[] = [];
  if (cur && cur > today) {
    // 같은 회사(운수사 이름 첫 단어)의 오늘 예정 차량에서 고른다 — 같은 운수사만 보면 오늘 예정에 없던
    // 영업소 차량이 들어올 때마다 금일 계획수량이 1대씩 늘어난다(11/13 20대→25대).
    // 다른 회사 차량은 건드리지 않는다(그 회사와 합의하지 않은 날짜로 보내게 된다).
    const company = companyOf(op);
    const { data: todays, error: tErr } = await sb
      .from("vehicles")
      .select("plate, operator")
      .eq("planned_date", today)
      .like("operator", `${company}%`)
      .neq("plate", plate)
      .order("plate");
    if (tErr) throw new Error(tErr.message);
    let rows = ((todays ?? []) as { plate: string; operator: string | null }[]).filter(
      (x) => companyOf(x.operator ?? "") === company,
    );
    if (rows.length) {
      // 배차표 설치제외 차량은 후보에서 뺀다 — 옮기면 금일 설치제외 수·사유가 리포트에서 빠진다(조회 실패는 무시)
      const { data: ex } = await sb.from("dispatch_times").select("plate").eq("date", today).eq("excluded", true).range(0, 999);
      const excluded = new Set(((ex ?? []) as { plate: string }[]).map((x) => x.plate));
      rows = rows.filter((x) => !excluded.has(x.plate));
      const started = await platesWithRecords(sb, rows.map((x) => x.plate), false);
      order = swapOrder(
        rows.map((x) => ({ plate: x.plate, started: started.has(x.plate), sameOp: (x.operator ?? "") === op })),
        plate,
      );
    }
  }
  let swap: string | null = order[0] ?? null;
  if (!opts.dryRun) {
    // 내 예정일부터 조건부 갱신(CAS) — 첫 사진 업로드와 팀명 자동저장이 동시에 기록을 만들면 두 요청이
    // 모두 여기 오는데, 한쪽만 성공해야 교환 상대가 두 대 옮겨지는 일이 없다.
    let q = sb.from("vehicles").update({ planned_date: today }).eq("plate", plate);
    q = cur ? q.eq("planned_date", cur) : q.is("planned_date", null);
    const { data: hit, error: uErr } = await q.select("plate");
    if (uErr) throw new Error(uErr.message);
    if (!hit?.length) return moves; // 다른 요청이 먼저 처리함
    // 교환 상대도 조건부 갱신 — 두 차량이 동시에 들어와 같은 상대를 고르면 한쪽만 성공하고,
    // 놓친 쪽은 다음 후보로 넘어간다(같은 상대를 두 번 옮기면 오늘 수량이 1대 늘어난다).
    swap = null;
    for (const cand of cur ? order : []) {
      const { data: got, error: sErr } = await sb
        .from("vehicles")
        .update({ planned_date: cur })
        .eq("plate", cand)
        .eq("planned_date", today)
        .select("plate");
      if (sErr) throw new Error(sErr.message);
      if (got?.length) {
        swap = cand;
        break;
      }
    }
  }
  if (swap && cur) moves.push({ plate: swap, from: today, to: cur });
  moves.push({ plate, from: cur, to: today });
  return moves;
}

// ── 호출부 공용 — 설정이 꺼져 있으면 아무것도 안 하고, 실패해도 저장·조회 흐름을 막지 않는다 ──

/** 작업 시작·완료 시점용. 예정일이 바뀌었으면 true(호출부가 대시보드 캐시 갱신). */
export async function settleIfQuota(sb: SB, plate: string, slug?: string): Promise<boolean> {
  if (!(await isQuotaMode(slug))) return false;
  try {
    return (await settleQuota(sb, plate, workDateString(new Date()))).length > 0;
  } catch (e) {
    console.error("[quota] 예정일 재배정 실패", plate, e instanceof Error ? e.message : e);
    return false;
  }
}

/** 금일 목록을 읽기 전 이월 정리용(배차표 옵션·설치시작 보고·대시보드). */
export async function carryOverIfQuota(slug: string): Promise<void> {
  if (!(await isQuotaMode(slug))) return;
  try {
    await carryOverQuota(createServiceClient(slug), workDateString(new Date()));
  } catch (e) {
    console.error("[quota] 이월 실패", slug, e instanceof Error ? e.message : e);
  }
}
