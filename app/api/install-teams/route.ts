import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { getInstallTeamsFull, makeTeamNormalizer } from "@/lib/settings";
import { workDateString } from "@/lib/work-day";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 설치팀 확인 팝업용 — 저장(saved_at) 완료된 차량을 팀별로 집계.
//   GET /api/install-teams          → 팀별 누적 대수 [{ team, count }]
//   GET /api/install-teams?team=X   → 그 팀이 설치한 차량 [{ plate, operator, saved_at }]
export async function GET(req: NextRequest) {
  const team = (req.nextUrl.searchParams.get("team") ?? "").trim();
  const supabase = createServiceClient();
  const norm = makeTeamNormalizer(await getInstallTeamsFull());

  if (team) {
    // 팀명 미입력("팀 미입력")도 조회되도록 전체를 받아 정규화된 팀명으로 필터
    const rows = await fetchAll<{
      plate: string;
      operator: string | null;
      team: string | null;
      saved_at: string;
    }>((from, to) =>
      supabase
        .from("records")
        .select("plate, operator, team, saved_at")
        .not("saved_at", "is", null)
        .order("saved_at", { ascending: false })
        .order("plate")
        .range(from, to),
    );
    const vehicles = rows
      .filter((r) => norm(r.team) === norm(team))
      .map((r) => ({ plate: r.plate, operator: r.operator, saved_at: r.saved_at }));
    return NextResponse.json({ vehicles });
  }

  // 소요시간 통계용 컬럼 포함 조회 — 컬럼 없는 옛 DB면 team·saved_at만으로 재시도(통계만 생략)
  type StatRow = {
    team: string | null;
    saved_at: string | null;
    start_notified_at?: string | null;
    complete_notified_at?: string | null;
  };
  let rows: StatRow[];
  try {
    rows = await fetchAll<StatRow>((from, to) =>
      supabase
        .from("records")
        .select("team, saved_at, start_notified_at, complete_notified_at")
        .not("saved_at", "is", null)
        .order("plate")
        .range(from, to),
    );
  } catch {
    rows = await fetchAll<StatRow>((from, to) =>
      supabase
        .from("records")
        .select("team, saved_at")
        .not("saved_at", "is", null)
        .order("plate")
        .range(from, to),
    );
  }

  const byTeam = new Map<
    string,
    { count: number; durSum: number; durN: number; days: Set<string> }
  >();
  const DAY_MS = 86400000;
  for (const r of rows) {
    const t = norm(r.team);
    const g = byTeam.get(t) ?? { count: 0, durSum: 0, durN: 0, days: new Set<string>() };
    g.count += 1;
    if (r.saved_at) g.days.add(workDateString(r.saved_at));
    // 소요시간 = 시작 보고~완료 보고. 0 이하·24시간 초과는 이상값으로 제외
    if (r.start_notified_at && r.complete_notified_at) {
      const dur = Date.parse(r.complete_notified_at) - Date.parse(r.start_notified_at);
      if (dur > 0 && dur <= DAY_MS) {
        g.durSum += dur;
        g.durN += 1;
      }
    }
    byTeam.set(t, g);
  }
  const teams = [...byTeam.entries()]
    .map(([team, g]) => ({
      team,
      count: g.count,
      avgMin: g.durN > 0 ? Math.round(g.durSum / g.durN / 60000) : null,
      days: g.days.size,
      perDay: g.days.size > 0 ? Math.round((g.count / g.days.size) * 10) / 10 : null,
    }))
    .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team, "ko"));
  return NextResponse.json({ teams, total: rows.length });
}
