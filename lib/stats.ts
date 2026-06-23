// 대시보드 통계 로더 — 전체 차량 대비 완료(기본 13장) 현황.
// 메타데이터는 Supabase. Supabase REST는 요청당 1000행 제한이 있어 페이지네이션으로 전수 조회.

import { createServiceClient } from "@/lib/supabase/server";
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

const PAGE = 1000;

export async function loadStats(): Promise<DashboardStats> {
  const supabase = createServiceClient();

  // 전체 차량(운수사 포함) — 1000행씩 끝까지
  const vehicles: { plate: string; operator: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("plate, operator")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    vehicles.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  // 사진 plate별 장수 집계 — 1000행씩 끝까지
  const photoCount = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("photos")
      .select("plate")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const p of data ?? []) {
      photoCount.set(p.plate, (photoCount.get(p.plate) ?? 0) + 1);
    }
    if (!data || data.length < PAGE) break;
  }

  const target = DEFAULT_PHOTO_COUNT;
  let complete = 0;
  let inProgress = 0;
  let notStarted = 0;
  const byOp = new Map<string, OperatorProgress>();

  for (const v of vehicles) {
    const c = photoCount.get(v.plate) ?? 0;
    const op = v.operator?.trim() || "미지정";
    const rec = byOp.get(op) ?? { operator: op, total: 0, complete: 0, inProgress: 0 };
    rec.total++;
    if (c >= target) {
      complete++;
      rec.complete++;
    } else if (c > 0) {
      inProgress++;
      rec.inProgress++;
    } else {
      notStarted++;
    }
    byOp.set(op, rec);
  }

  // 시작된(완료/진행중 ≥1) 운수사만, 남은 작업(미완료) 많은 순으로
  const byOperator = [...byOp.values()]
    .filter((o) => o.complete + o.inProgress > 0)
    .sort((a, b) => b.total - b.complete - (a.total - a.complete));

  return { target, totalVehicles: vehicles.length, complete, inProgress, notStarted, byOperator };
}
