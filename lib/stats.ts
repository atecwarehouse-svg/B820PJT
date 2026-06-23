// 대시보드 통계 로더 — 전체 차량 대비 완료(기본 13장) 현황.
// 메타데이터는 Supabase. Supabase REST는 요청당 1000행 제한이 있어 페이지네이션으로 전수 조회.

import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
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
async function loadByScan(supabase: SB, target: number): Promise<DashboardStats> {
  const [vehicles, photoRows] = await Promise.all([
    fetchAll<{ plate: string; operator: string | null }>((from, to) =>
      supabase.from("vehicles").select("plate, operator").range(from, to),
    ),
    fetchAll<{ plate: string }>((from, to) =>
      supabase.from("photos").select("plate").range(from, to),
    ),
  ]);

  const photoCount = new Map<string, number>();
  for (const p of photoRows) {
    photoCount.set(p.plate, (photoCount.get(p.plate) ?? 0) + 1);
  }

  const byOp = new Map<string, OperatorProgress>();
  for (const v of vehicles) {
    const c = photoCount.get(v.plate) ?? 0;
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
