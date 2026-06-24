// 대시보드 통계 로더 — 전체 차량 대비 완료(기본 13장) 현황.
// 메타데이터는 Supabase. Supabase REST는 요청당 1000행 제한이 있어 페이지네이션으로 전수 조회.

import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { workDateString } from "@/lib/work-day";
import { DEFAULT_PHOTO_COUNT } from "@/lib/slots";

export interface OperatorProgress {
  operator: string;
  total: number; // 해당 운수사 전체 차량 수
  complete: number; // 13장 이상
  inProgress: number; // 1~12장
}

export interface DashboardStats {
  target: number; // 기준 장수 (13)
  totalVehicles: number;
  complete: number;
  inProgress: number;
  notStarted: number;
  byOperator: OperatorProgress[];
}

type SB = ReturnType<typeof createServiceClient>;

function assemble(target: number, ops: OperatorProgress[]): DashboardStats {
  let totalVehicles = 0;
  let complete = 0;
  let inProgress = 0;
  for (const o of ops) {
    totalVehicles += o.total;
    complete += o.complete;
    inProgress += o.inProgress;
  }
  // 시작된(완료/진행중 ≥1) 운수사만, 남은 작업(미완료) 많은 순으로
  const byOperator = ops
    .filter((o) => o.complete + o.inProgress > 0)
    .sort((a, b) => b.total - b.complete - (a.total - a.complete));
  return {
    target,
    totalVehicles,
    complete,
    inProgress,
    notStarted: totalVehicles - complete - inProgress,
    byOperator,
  };
}

// DB 집계 뷰(operator_progress) 사용 — 수만 행을 앱으로 안 가져옴. 뷰 없으면 null.
async function loadFromView(supabase: SB, target: number): Promise<DashboardStats | null> {
  const { data, error } = await supabase
    .from("operator_progress")
    .select("operator, total, complete, in_progress")
    .range(0, 9999); // 운수사 수만큼(수십~수백) — 제한 여유
  if (error || !data) return null; // 뷰 미생성(마이그레이션 전) → 폴백
  const ops: OperatorProgress[] = data.map((r) => ({
    operator: (r.operator as string)?.trim() || "미지정",
    total: r.total as number,
    complete: r.complete as number,
    inProgress: r.in_progress as number,
  }));
  return assemble(target, ops);
}

// 폴백: 차량/사진 전수 조회 후 앱에서 집계 (뷰가 아직 없을 때).
// '단말기 없음'(records.na_slots) 칸은 사진 1장으로 간주해 합산.
async function loadByScan(supabase: SB, target: number): Promise<DashboardStats> {
  const [vehicles, photoRows, naRows] = await Promise.all([
    fetchAll<{ plate: string; operator: string | null }>((from, to) =>
      supabase.from("vehicles").select("plate, operator").range(from, to),
    ),
    fetchAll<{ plate: string }>((from, to) =>
      supabase.from("photos").select("plate").range(from, to),
    ),
    fetchAll<{ plate: string; na_slots: string[] | null }>((from, to) =>
      supabase.from("records").select("plate, na_slots").range(from, to),
    ),
  ]);

  const photoCount = new Map<string, number>();
  for (const p of photoRows) {
    photoCount.set(p.plate, (photoCount.get(p.plate) ?? 0) + 1);
  }
  const naCount = new Map<string, number>();
  for (const r of naRows) {
    naCount.set(r.plate, Array.isArray(r.na_slots) ? r.na_slots.length : 0);
  }

  const byOp = new Map<string, OperatorProgress>();
  for (const v of vehicles) {
    const c = (photoCount.get(v.plate) ?? 0) + (naCount.get(v.plate) ?? 0);
    const op = v.operator?.trim() || "미지정";
    const rec = byOp.get(op) ?? { operator: op, total: 0, complete: 0, inProgress: 0 };
    rec.total++;
    if (c >= target) rec.complete++;
    else if (c > 0) rec.inProgress++;
    byOp.set(op, rec);
  }
  return assemble(target, [...byOp.values()]);
}

export async function loadStats(): Promise<DashboardStats> {
  const supabase = createServiceClient();
  const target = DEFAULT_PHOTO_COUNT;
  // 집계 뷰 우선, 없으면 전수 스캔으로 폴백
  return (await loadFromView(supabase, target)) ?? (await loadByScan(supabase, target));
}

// 진행중 = 사진을 1장 이상 올렸고 아직 13장 미만인 차량.
// (사진 0장은 진행중 아님 → 미설치로 집계. 삭제된 차량도 자연히 미설치가 됨)
export interface InProgressVehicle {
  plate: string;
  operator: string;
  route: string;
  photoCount: number;
}

export async function loadInProgressList(): Promise<InProgressVehicle[]> {
  const supabase = createServiceClient();
  const target = DEFAULT_PHOTO_COUNT;

  // 시작된 차량 = records 존재. + plate별 사진 장수. '단말기 없음'은 사진 1장으로 간주.
  const [recRows, photoRows] = await Promise.all([
    fetchAll<{ plate: string; na_slots: string[] | null }>((from, to) =>
      supabase.from("records").select("plate, na_slots").range(from, to),
    ),
    fetchAll<{ plate: string }>((from, to) =>
      supabase.from("photos").select("plate").range(from, to),
    ),
  ]);
  const photoCnt = new Map<string, number>();
  for (const p of photoRows) photoCnt.set(p.plate, (photoCnt.get(p.plate) ?? 0) + 1);
  // 충족 칸수 = 사진수 + 단말기없음 칸수
  const count = new Map<string, number>();
  for (const r of recRows) {
    const na = Array.isArray(r.na_slots) ? r.na_slots.length : 0;
    count.set(r.plate, (photoCnt.get(r.plate) ?? 0) + na);
  }

  // 충족 1칸 이상 & 13칸 미만 = 진행중 (0칸은 제외 → 미설치로 집계)
  const candidates = recRows
    .map((r) => r.plate)
    .filter((plate) => {
      const c = count.get(plate) ?? 0;
      return c >= 1 && c < target;
    });
  if (candidates.length === 0) return [];

  // 후보 차량의 운수사/노선 조회 (chunk로 in)
  const meta = new Map<string, { operator: string; route: string }>();
  const CH = 200;
  for (let i = 0; i < candidates.length; i += CH) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("plate, operator, route")
      .in("plate", candidates.slice(i, i + CH));
    if (error) throw new Error(error.message);
    for (const v of data ?? []) {
      meta.set(v.plate, { operator: v.operator ?? "", route: v.route ?? "" });
    }
  }

  return candidates
    .map((plate) => ({
      plate,
      operator: meta.get(plate)?.operator ?? "",
      route: meta.get(plate)?.route ?? "",
      photoCount: count.get(plate) ?? 0,
    }))
    .sort((a, b) => b.photoCount - a.photoCount); // 완료 임박 순
}

// ============================================================
// 설치 진행현황 (완료 = '저장' 기준) · 설치 일정
// 완료 = records.saved_at 있음. 완료일 = saved_at(KST 날짜).
// ============================================================

// 완료(저장)된 plate → saved_at(ISO) 맵
async function fetchCompletedMap(supabase: SB): Promise<Map<string, string>> {
  const rows = await fetchAll<{ plate: string; saved_at: string }>((from, to) =>
    supabase
      .from("records")
      .select("plate, saved_at")
      .not("saved_at", "is", null)
      .range(from, to),
  );
  const map = new Map<string, string>();
  for (const r of rows) if (r.plate && r.saved_at) map.set(r.plate, r.saved_at);
  return map;
}

export interface InstallGroup {
  operator: string;
  route: string;
  total: number;
  complete: number; // saved_at 있음
  todayComplete: number; // saved_at 날짜 == 오늘(KST)
}

export interface CompletedVehicle {
  plate: string;
  operator: string;
  route: string;
  workDate: string; // 완료 업무일 (YYYY-MM-DD, 20:00~익일 07:00 기준)
}

export interface InstallProgress {
  totalVehicles: number;
  complete: number;
  notComplete: number;
  todayComplete: number;
  today: string; // 현재 업무일
  groups: InstallGroup[];
  completedList: CompletedVehicle[]; // 날짜별 검색용 (완료 차량만)
}

export async function loadInstallProgress(): Promise<InstallProgress> {
  const supabase = createServiceClient();
  const [vehicles, completed] = await Promise.all([
    fetchAll<{ plate: string; operator: string | null; route: string | null }>((from, to) =>
      supabase.from("vehicles").select("plate, operator, route").range(from, to),
    ),
    fetchCompletedMap(supabase),
  ]);

  const today = workDateString(new Date()); // 현재 업무일(20:00~익일 07:00 기준)
  let complete = 0;
  let todayComplete = 0;
  const byGroup = new Map<string, InstallGroup>();
  const completedList: CompletedVehicle[] = [];

  for (const v of vehicles) {
    const op = v.operator?.trim() || "미지정";
    const rt = v.route?.trim() || "";
    const key = `${op}|||${rt}`;
    const g =
      byGroup.get(key) ?? { operator: op, route: rt, total: 0, complete: 0, todayComplete: 0 };
    g.total++;
    const savedAt = completed.get(v.plate);
    if (savedAt) {
      complete++;
      g.complete++;
      const wd = workDateString(savedAt);
      completedList.push({ plate: v.plate, operator: op, route: rt, workDate: wd });
      if (wd === today) {
        todayComplete++;
        g.todayComplete++;
      }
    }
    byGroup.set(key, g);
  }

  // 작업 시작된(완료 ≥1) 영업소만, 미완료 많은 순
  const groups = [...byGroup.values()]
    .filter((g) => g.complete > 0)
    .sort((a, b) => b.total - b.complete - (a.total - a.complete));

  // 완료 차량은 업무일 최신순으로
  completedList.sort((a, b) => b.workDate.localeCompare(a.workDate));

  return {
    totalVehicles: vehicles.length,
    complete,
    notComplete: vehicles.length - complete,
    todayComplete,
    today,
    groups,
    completedList,
  };
}

export interface ScheduleDay {
  date: string; // YYYY-MM-DD (설치 예정일)
  planned: number; // 그 날 예정 대수
  pilot: number; // 그 중 시범설치 대수
  done: number; // 그 중 완료(저장)된 대수
}

export interface ScheduleStats {
  days: ScheduleDay[];
  cumPlanned: number[]; // days 순서의 누적 계획
  cumDone: number[]; // days 순서의 누적 실적
  totalPlanned: number;
  totalDone: number;
  pilotTotal: number;
  pilotDone: number;
}

export async function loadScheduleStats(): Promise<ScheduleStats> {
  const supabase = createServiceClient();
  const [vehicles, completed] = await Promise.all([
    fetchAll<{ plate: string; planned_date: string | null; is_pilot: boolean | null }>((from, to) =>
      supabase.from("vehicles").select("plate, planned_date, is_pilot").range(from, to),
    ),
    fetchCompletedMap(supabase),
  ]);

  const byDate = new Map<string, ScheduleDay>();
  let pilotTotal = 0;
  let pilotDone = 0;

  for (const v of vehicles) {
    if (!v.planned_date) continue; // 예정일 없는 차량은 일정 집계 제외
    const date = v.planned_date.slice(0, 10);
    const d = byDate.get(date) ?? { date, planned: 0, pilot: 0, done: 0 };
    d.planned++;
    const isDone = completed.has(v.plate);
    if (v.is_pilot) {
      d.pilot++;
      pilotTotal++;
      if (isDone) pilotDone++;
    }
    if (isDone) d.done++;
    byDate.set(date, d);
  }

  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const cumPlanned: number[] = [];
  const cumDone: number[] = [];
  let cp = 0;
  let cd = 0;
  for (const d of days) {
    cp += d.planned;
    cd += d.done;
    cumPlanned.push(cp);
    cumDone.push(cd);
  }

  return { days, cumPlanned, cumDone, totalPlanned: cp, totalDone: cd, pilotTotal, pilotDone };
}
