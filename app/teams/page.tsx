import Link from "@/components/PLink";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { DEFAULT_TEAM_COMPANIES, getInstallTeamsFull, getTeamCompanies, makeTeamNormalizer, teamLabel } from "@/lib/settings";
import { currentSlug, isDefault } from "@/lib/project";
import { workDateString } from "@/lib/work-day";
import TeamsClient from "./TeamsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 설치팀별 확인 페이지 — 저장(saved_at) 완료 차량을 팀별 집계, 기간·운수사·노선 검색.
// 집계 기준은 대시보드 '설치팀 확인' 팝업(/api/install-teams)과 동일: saved_at != null.
export default async function TeamsPage() {
  const supabase = createServiceClient();
  const installTeams = await getInstallTeamsFull();
  const norm = makeTeamNormalizer(installTeams);
  // 관리자 '소속' 탭에서 지정한 팀별 소속사 — 정규화된 팀 라벨("팀명 이름") 기준
  const companyMap = Object.fromEntries(
    installTeams.filter((t) => t.company).map((t) => [teamLabel(t), t.company]),
  );
  // 그룹 버튼 = 소속사 목록(관리자 '소속' 탭). B820은 소속 미지정 팀을 팀명 앞글자로 나누던 옛 규칙의 두 회사도 포함.
  const groups = [...new Set([...(await getTeamCompanies()), ...(isDefault(currentSlug()) ? DEFAULT_TEAM_COMPANIES : [])])];
  const rows = await fetchAll<{
    plate: string;
    operator: string | null;
    route: string | null;
    team: string | null;
    saved_at: string;
  }>((from, to) =>
    supabase
      .from("records")
      .select("plate, operator, route, team, saved_at")
      .not("saved_at", "is", null)
      .order("saved_at", { ascending: false })
      .order("plate")
      .range(from, to),
  );
  const vehicles = rows.map((r) => ({
    plate: r.plate,
    operator: r.operator?.trim() || "미지정",
    route: r.route?.trim() || "미지정",
    team: norm(r.team),
    date: workDateString(r.saved_at),
  }));

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-16 pt-6">
      <div className="page-head">
        <Link href="/b820" className="pill">
          ← 홈
        </Link>
        <h1>👷 설치팀별 확인</h1>
        <span className="w-14" />
      </div>
      <p className="-mt-2 mb-3 text-center text-xs text-gray-500">
        설치(저장) 완료 기준 · 설치일은 업무일(20시~익일 12시) 기준
      </p>
      <TeamsClient vehicles={vehicles} companyMap={companyMap} groups={groups} />
    </main>
  );
}
