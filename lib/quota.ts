// 수량 차감 방식(quota_mode) — 운수사와 날짜별 '수량'만 합의하고 어떤 차량을 설치할지는
// 그날 들어오는 차량으로 정하는 프로젝트(공항버스)용.
// 앱의 금일 대상·리포트·달력·엑셀은 전부 vehicles.planned_date(차량별 예정일)를 읽으므로,
// 읽는 쪽은 그대로 두고 예정일이 현장 실제를 따라가게 맞춘다.
//   settle  — 차량 작업 시작·완료 시 그 차량의 예정일을 오늘로. 오늘 예정·미착수 차량이 있으면
//             자리를 바꿔 일자별 수량 유지, 없으면 원래 날짜(미래) 수량에서 1대 차감.
//   carry   — 지난 날짜에 남은 미완료 차량은 그 운수사의 오늘 이후 가장 가까운 예정일로 이월.
// vehicles 부분 갱신은 반드시 update().in()/eq() — upsert는 operator not-null에 걸린다.
import type { createServiceClient } from "@/lib/supabase/server";
import { chunk, fetchAll } from "@/lib/supabase/paginate";

type SB = ReturnType<typeof createServiceClient>;
export type Move = { plate: string; from: string | null; to: string };
type Opts = { dryRun?: boolean };

/** 오늘 이후(오늘 포함) 가장 가까운 예정일. 없으면 null */
export function nextDateFor(dates: Iterable<string>, today: string): string | null {
  let best: string | null = null;
  for (const d of dates) if (d >= today && (best === null || d < best)) best = d;
  return best;
}

/** 자리를 바꿀 후보 — 오늘 예정·미착수(records 없음) 차량 중 차량번호 순 첫 대 */
export function pickSwap(
  candidates: { plate: string; started: boolean }[],
  self: string,
): string | null {
  return (
    candidates
      .filter((c) => c.plate !== self && !c.started)
      .map((c) => c.plate)
      .sort()[0] ?? null
  );
}

const ymd = (v: unknown) => (v ? String(v).slice(0, 10) : null);

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
  const { data: v, error } = await sb
    .from("vehicles")
    .select("plate, operator, planned_date")
    .eq("plate", plate)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!v) return [];
  const op = (v.operator as string | null) ?? "";
  const moves = await carryOverQuota(sb, today, op, opts);
  const cur = ymd(v.planned_date);
  if (cur === today) return moves;

  let swap: string | null = null;
  if (cur) {
    const { data: todays, error: tErr } = await sb
      .from("vehicles")
      .select("plate")
      .eq("operator", op)
      .eq("planned_date", today)
      .neq("plate", plate)
      .order("plate");
    if (tErr) throw new Error(tErr.message);
    const plates = ((todays ?? []) as { plate: string }[]).map((x) => x.plate);
    if (plates.length) {
      const started = await platesWithRecords(sb, plates, false);
      swap = pickSwap(plates.map((p) => ({ plate: p, started: started.has(p) })), plate);
    }
  }
  if (!opts.dryRun) {
    if (swap && cur) await setDates(sb, [swap], cur);
    await setDates(sb, [plate], today);
  }
  if (swap && cur) moves.push({ plate: swap, from: today, to: cur });
  moves.push({ plate, from: cur, to: today });
  return moves;
}
