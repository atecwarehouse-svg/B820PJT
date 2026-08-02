import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { getInstallTeamsFull, makeTeamNormalizer } from "@/lib/settings";
import { workDateString } from "@/lib/work-day";
import TeamsClient from "./TeamsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 설치팀별 확인 페이지 — 저장(saved_at) 완료 차량을 팀별 집계, 기간·운수사·노선 검색.
// 집계 기준은 대시보드 '설치팀 확인' 팝업(/api/install-teams)과 동일: saved_at != null.
export default async function TeamsPage() {
  const supabase = createServiceClient();
  const norm = makeTeamNormalizer(await getInstallTeamsFull());
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
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← 홈
      </Link>
      <h1 className="mt-2 text-xl font-bold text-sky-700">👷 설치팀별 확인</h1>
      <p className="mt-1 text-xs text-gray-500">
        설치(저장) 완료 기준 · 설치일은 업무일(20시~익일 12시) 기준
      </p>
      <TeamsClient vehicles={vehicles} />
    </main>
  );
}
