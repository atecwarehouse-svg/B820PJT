import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { getInstallTeamsFull, teamLabel, type InstallTeam } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 기록의 팀 표기 통합 — 구기록("부천1")·신기록("부천1 최봉식")을 현재 등록된 팀의
// 라벨("팀명 이름")로 정규화해 같은 팀으로 집계. 등록에 없는 표기는 그대로 둔다.
function makeNormalizer(installTeams: InstallTeam[]) {
  return (raw: string | null): string => {
    const s = (raw ?? "").trim();
    if (!s) return "팀 미입력";
    for (const t of installTeams) {
      if (s === t.team || s === teamLabel(t) || s.startsWith(t.team + " ")) return teamLabel(t);
    }
    return s;
  };
}

// 설치팀 확인 팝업용 — 저장(saved_at) 완료된 차량을 팀별로 집계.
//   GET /api/install-teams          → 팀별 누적 대수 [{ team, count }]
//   GET /api/install-teams?team=X   → 그 팀이 설치한 차량 [{ plate, operator, saved_at }]
export async function GET(req: NextRequest) {
  const team = (req.nextUrl.searchParams.get("team") ?? "").trim();
  const supabase = createServiceClient();
  const norm = makeNormalizer(await getInstallTeamsFull());

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

  const rows = await fetchAll<{ team: string | null }>((from, to) =>
    supabase
      .from("records")
      .select("team")
      .not("saved_at", "is", null)
      .order("plate")
      .range(from, to),
  );
  const byTeam = new Map<string, number>();
  for (const r of rows) {
    const t = norm(r.team);
    byTeam.set(t, (byTeam.get(t) ?? 0) + 1);
  }
  const teams = [...byTeam.entries()]
    .map(([team, count]) => ({ team, count }))
    .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team, "ko"));
  return NextResponse.json({ teams, total: rows.length });
}
