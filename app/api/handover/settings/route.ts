import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { setSetting } from "@/lib/settings";
import { HANDOVER_CENTERS_KEY, HANDOVER_WORKERS_KEY, getCenters, getWorkers, type CenterMap, type Worker } from "@/lib/handover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 양도양수 관리자 설정 — 관리자 쿠키 필수.
//   GET → { centers: {영업소:센터}, workers: [{center,rank,name}], offices: [{name,count}] }  (offices = 업로드된 차량의 영업소별 대수)
//   PUT { centers?: {영업소:센터}, workers?: [{center,rank,name}] } → 보낸 것만 저장(전체 교체)
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET() {
  if (!(await isAdmin())) return bad("관리자 인증이 필요합니다.", 401);
  const sb = createServiceClient();
  const [centers, workers, rows] = await Promise.all([
    getCenters(),
    getWorkers(),
    fetchAll<{ operator: string }>((from, to) => sb.from("vehicles").select("operator").order("plate").range(from, to)).catch(() => []),
  ]);
  const count = new Map<string, number>();
  for (const r of rows) count.set(r.operator, (count.get(r.operator) ?? 0) + 1);
  const offices = [...count.entries()].map(([name, c]) => ({ name, count: c }));
  return NextResponse.json({ centers, workers, offices });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return bad("관리자 인증이 필요합니다.", 401);
  const body = (await req.json().catch(() => null)) as { centers?: unknown; workers?: unknown } | null;
  if (!body || (body.centers === undefined && body.workers === undefined)) return bad("centers 또는 workers 가 필요합니다.");

  let centers: CenterMap | undefined;
  if (body.centers !== undefined) {
    if (!body.centers || typeof body.centers !== "object" || Array.isArray(body.centers)) return bad("centers 형식이 잘못되었습니다.");
    centers = {};
    for (const [office, c] of Object.entries(body.centers as Record<string, unknown>)) {
      const center = String(c ?? "").trim();
      if (!office.trim() || !center) continue; // 미배정은 저장하지 않음
      if (center.length > 30) return bad("센터명은 30자 이하로 입력하세요.");
      centers[office.trim()] = center;
    }
  }
  let workers: Worker[] | undefined;
  if (body.workers !== undefined) {
    if (!Array.isArray(body.workers)) return bad("workers 형식이 잘못되었습니다.");
    workers = body.workers
      .map((w) => ({
        center: String((w as Worker)?.center ?? "").trim(),
        rank: String((w as Worker)?.rank ?? "").trim(),
        name: String((w as Worker)?.name ?? "").trim(),
      }))
      .filter((w) => w.name || w.center || w.rank)
      .slice(0, 100);
    const incomplete = workers.find((w) => !w.center || !w.name);
    if (incomplete) return bad(`센터와 이름은 비울 수 없습니다: ${incomplete.rank || incomplete.name || incomplete.center}`);
    if (workers.some((w) => w.center.length > 30 || w.rank.length > 40 || w.name.length > 40)) {
      return bad("센터 30자·직급·이름 40자 이하로 입력하세요.");
    }
    const dup = workers.find((w, i) => workers!.findIndex((x) => x.center === w.center && x.name === w.name) !== i);
    if (dup) return bad(`같은 센터에 같은 이름이 두 번 있습니다: ${dup.center} ${dup.name}`);
  }
  try {
    if (centers) await setSetting(HANDOVER_CENTERS_KEY, JSON.stringify(centers));
    if (workers) await setSetting(HANDOVER_WORKERS_KEY, JSON.stringify(workers));
  } catch (e) {
    return bad("저장 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류"), 500);
  }
  return NextResponse.json({ ok: true, centers: centers ?? (await getCenters()), workers: workers ?? (await getWorkers()) });
}
