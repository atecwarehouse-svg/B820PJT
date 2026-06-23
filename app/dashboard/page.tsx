import Link from "next/link";
import { unstable_cache } from "next/cache";
import { loadStats, loadInstallProgress, loadScheduleStats, loadInProgressList } from "@/lib/stats";
import type { InstallProgress, ScheduleStats, InProgressVehicle } from "@/lib/stats";
import ProgressDownloadButton from "@/components/ProgressDownloadButton";
import ScheduleChart from "@/components/ScheduleChart";
import InstallDateSearch from "@/components/InstallDateSearch";
import DailyReportModal from "@/components/DailyReportModal";
import KpiCards from "@/components/KpiCards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 집계 결과를 60초 캐시 — 실시간일 필요 없어 매 접속마다 재계산하지 않음
const getStats = unstable_cache(() => loadStats(), ["dashboard-stats"], {
  revalidate: 60,
});

// 설치 진행현황(저장 기준). 실패해도 페이지 전체가 죽지 않게 null 폴백.
const getInstall = unstable_cache(
  async (): Promise<InstallProgress | null> => {
    try {
      return await loadInstallProgress();
    } catch {
      return null;
    }
  },
  ["dashboard-install"],
  { revalidate: 60 },
);

// 설치 일정 — vehicles.planned_date/is_pilot 컬럼 필요(마이그레이션·임포트 전이면 null).
const getSchedule = unstable_cache(
  async (): Promise<ScheduleStats | null> => {
    try {
      return await loadScheduleStats();
    } catch {
      return null;
    }
  },
  ["dashboard-schedule"],
  { revalidate: 60 },
);

// 진행중(사진 미완료) 차량 목록 — KPI 진행중 팝업용.
const getInProgress = unstable_cache(
  async (): Promise<InProgressVehicle[]> => {
    try {
      return await loadInProgressList();
    } catch {
      return [];
    }
  },
  ["dashboard-inprogress"],
  { revalidate: 60 },
);

export default async function DashboardPage() {
  const [s, ip, sch, inProgressList] = await Promise.all([
    getStats(),
    getInstall(),
    getSchedule(),
    getInProgress(),
  ]);
  const ipPct = ip && ip.totalVehicles ? (ip.complete / ip.totalVehicles) * 100 : 0;

  return (
    <main className="mx-auto max-w-3xl px-3 pb-16 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-blue-600">
          ← 차량 입력
        </Link>
        <h1 className="text-lg font-bold text-blue-700">진행 현황</h1>
        <Link href="/list" className="text-sm text-blue-600">
          저장 목록 →
        </Link>
      </div>

      {/* ===== 설치 진행현황 (완료 = '저장' 기준) — 최상단 + 버튼 ===== */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">
          설치 진행현황
          <span className="ml-1 font-normal text-gray-400">(완료 = ‘저장’ 기준)</span>
        </h2>
        <div className="flex items-center gap-2">
          {ip && (
            <DailyReportModal
              completedList={ip.completedList}
              scheduleDays={sch?.days ?? []}
              cumDone={ip.complete}
              cumPlanned={sch?.totalPlanned ?? 0}
              today={ip.today}
              inProgress={s.inProgress}
            />
          )}
          <ProgressDownloadButton />
        </div>
      </div>

      {ip === null ? (
        <p className="rounded-xl border border-gray-200 bg-white py-8 text-center text-sm text-gray-400">
          진행현황을 불러오지 못했습니다.
        </p>
      ) : (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm text-gray-500">설치 완료(저장)</p>
              <p className="mt-1 text-3xl font-bold text-green-700 tabular-nums">
                {ip.complete.toLocaleString()}
                <span className="text-lg font-medium text-gray-400">
                  {" "}
                  / {ip.totalVehicles.toLocaleString()}대
                </span>
              </p>
            </div>
            <span className="text-2xl font-bold text-green-700 tabular-nums">{ipPct.toFixed(1)}%</span>
          </div>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${ipPct}%` }} />
          </div>
          <p className="mt-1 text-right text-[11px] text-gray-400">
            미완료 {ip.notComplete.toLocaleString()}대 · 오늘 완료 {ip.todayComplete.toLocaleString()}대
          </p>
        </section>
      )}

      {/* ===== KPI 카드 (사진 기준 · 진행중 클릭 시 상세) ===== */}
      <KpiCards
        complete={s.complete}
        inProgress={s.inProgress}
        notStarted={s.notStarted}
        target={s.target}
        inProgressList={inProgressList}
      />

      {/* ===== 설치 일정 ===== */}
      <h2 className="mb-2 mt-6 text-sm font-semibold text-gray-700">
        설치 일정
        <span className="ml-1 font-normal text-gray-400">(예정일 기준 계획 대비 실적)</span>
      </h2>
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {sch === null ? (
          <p className="py-8 text-center text-sm text-gray-400">
            설치 일정 데이터가 없습니다. (예정일 임포트 필요)
          </p>
        ) : (
          <ScheduleChart stats={sch} />
        )}
      </section>

      {/* ===== 운수사별 진행 현황 (사진 기준) ===== */}
      <h2 className="mb-2 mt-6 text-sm font-semibold text-gray-700">
        운수사별 진행 현황
        <span className="ml-1 font-normal text-gray-400">(작업 시작된 운수사)</span>
      </h2>
      {s.byOperator.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">아직 시작된 운수사가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {s.byOperator.map((o) => {
            const opct = o.total ? (o.complete / o.total) * 100 : 0;
            const allDone = o.complete === o.total;
            return (
              <li key={o.operator} className="px-3 py-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{o.operator}</span>
                  <span className="tabular-nums text-gray-500">
                    {o.complete}/{o.total}대 · {opct.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${allDone ? "bg-green-500" : "bg-blue-500"}`}
                    style={{ width: `${opct}%` }}
                  />
                </div>
                {o.inProgress > 0 && (
                  <p className="mt-1 text-[11px] text-amber-600">진행중 {o.inProgress}대</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ===== 날짜별 완료 검색 ===== */}
      {ip && (
        <div className="mt-6">
          <InstallDateSearch completedList={ip.completedList} today={ip.today} />
        </div>
      )}

      {/* ===== 영업소별 (운수사·노선) — 최하단 ===== */}
      {ip && (
        <>
          <h2 className="mb-2 mt-8 text-sm font-semibold text-gray-700">
            영업소별
            <span className="ml-1 font-normal text-gray-400">(운수사·노선 / 저장 기준)</span>
          </h2>
          {ip.groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">아직 저장 완료된 차량이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {ip.groups.map((g) => {
                const gp = g.total ? (g.complete / g.total) * 100 : 0;
                const allDone = g.complete === g.total;
                return (
                  <li key={`${g.operator}|${g.route}`} className="px-3 py-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {g.operator}
                        {g.route && <span className="ml-1 text-xs font-normal text-gray-400">{g.route}</span>}
                      </span>
                      <span className="tabular-nums text-gray-500">
                        {g.complete}/{g.total}대 · {gp.toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${allDone ? "bg-green-500" : "bg-blue-500"}`}
                        style={{ width: `${gp}%` }}
                      />
                    </div>
                    {g.todayComplete > 0 && (
                      <p className="mt-1 text-[11px] text-green-600">오늘 완료 {g.todayComplete}대</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
