import Link from "next/link";
import { unstable_cache } from "next/cache";
import {
  loadStats,
  loadInstallProgress,
  loadScheduleStats,
  loadInProgressList,
  loadTodayPlanGroups,
  loadOperatorSchedules,
} from "@/lib/stats";
import type {
  InstallProgress,
  ScheduleStats,
  InProgressVehicle,
  TodayPlanGroup,
  OperatorSchedule,
} from "@/lib/stats";
import { workDateString } from "@/lib/work-day";
import ProgressDownloadButton from "@/components/ProgressDownloadButton";
import ScheduleUploadModal from "@/components/ScheduleUploadModal";
import ConsultationModal from "@/components/ConsultationModal";
import ReportHub from "@/components/ReportHub";
import TeamStatsModal from "@/components/TeamStatsModal";
import ScheduleChart from "@/components/ScheduleChart";
import InstallDateSearch from "@/components/InstallDateSearch";
import DailyReportModal from "@/components/DailyReportModal";
import KpiCards from "@/components/KpiCards";
import RefreshButton from "@/components/RefreshButton";
import DashboardDetailTabs from "@/components/DashboardDetailTabs";
import { isProgressUnlocked } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 집계 결과를 60초 캐시 — 실시간일 필요 없어 매 접속마다 재계산하지 않음.
// tags:["dashboard"] → 관리자 삭제 등에서 revalidateTag로 즉시 갱신 가능.
const getStats = unstable_cache(() => loadStats(), ["dashboard-stats"], {
  revalidate: 60,
  tags: ["dashboard"],
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
  { revalidate: 60, tags: ["dashboard"] },
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
  { revalidate: 60, tags: ["dashboard"] },
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
  { revalidate: 60, tags: ["dashboard"] },
);

// 금일 설치계획 운수사·노선별 집계 — 설치시작 보고 카드용. 날짜가 캐시 키에 포함됨.
const getTodayPlan = unstable_cache(
  async (date: string): Promise<TodayPlanGroup[]> => {
    try {
      return await loadTodayPlanGroups(date);
    } catch {
      return [];
    }
  },
  ["dashboard-todayplan"],
  { revalidate: 60, tags: ["dashboard"] },
);

// 운수사별 설치 예정일·대수 — 운수사 협의사항 폼(운수사 검색 → 날짜 선택)용.
const getOperatorSchedules = unstable_cache(
  async (): Promise<OperatorSchedule[]> => {
    try {
      return await loadOperatorSchedules();
    } catch {
      return [];
    }
  },
  ["dashboard-operator-schedules"],
  { revalidate: 60, tags: ["dashboard"] },
);

export default async function DashboardPage() {
  // 상세 섹션(설치 일정·운수사별·영업소별·날짜별)은 잠금 해제 전에는 서버가 아예 안 내려준다.
  const detailUnlocked = isProgressUnlocked();
  const todayWork = workDateString(new Date()); // 현재 업무일
  const [s, ip, sch, inProgressList, todayPlanGroups, operatorSchedules] = await Promise.all([
    getStats(),
    getInstall(),
    getSchedule(),
    getInProgress(),
    getTodayPlan(todayWork),
    getOperatorSchedules(),
  ]);
  // 렌더 시각(KST) — 새로고침할 때마다 갱신되어 데이터 최신 여부를 바로 알 수 있다.
  const updatedAt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
  const ipPct = ip && ip.totalVehicles ? (ip.complete / ip.totalVehicles) * 100 : 0;
  // 진행중 = 시작(기록 있음)했으나 13장 미만 차량(사진 0장 중단 포함 · 팝업 목록과 일치)
  const inProgressCount = inProgressList.length;
  const remainCount = Math.max(0, s.totalVehicles - s.complete - inProgressCount);

  // 진행현황 다운로드 기준일 기본값 = 현재 업무일. 팝업에서 날짜를 바꾸면
  // 그 날짜까지의 스냅샷(계획·기준일·완료)으로 받는다. 계획수량은 예정일(planned_date)에서 파생.
  const today = ip?.today ?? todayWork;
  const scheduleDays = sch?.days.map((d) => ({ date: d.date, planned: d.planned })) ?? [];
  // 금일 설치현황 — 설치대상(예정일=금일)·설치완료(금일 저장 완료)
  const todayPlanned = sch?.days.find((d) => d.date === today)?.planned ?? 0;
  const todayDone = ip?.todayComplete ?? 0;

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

      {/* 새로고침 + 갱신 시각 — 홈 화면 앱에는 브라우저 새로고침이 없어 입력 반영 확인용 */}
      <div className="mb-4 flex items-center justify-center gap-2">
        <RefreshButton />
        <span className="text-xs text-gray-400">갱신 {updatedAt}</span>
      </div>

      {/* ===== 설치 진행현황 (완료 = 저장 + 설치 전·후 사진 완료) — 최상단 + 버튼 ===== */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700">
          설치 진행현황
          <span className="ml-1 font-normal text-gray-400">(완료 = 저장 + 설치 전·후 사진 완료)</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <ReportHub
            planToday={todayWork}
            shareToday={ip?.today ?? todayWork}
            planGroups={todayPlanGroups}
            todayPlanned={todayPlanned}
            todayDone={todayDone}
            complete={s.complete}
            inProgress={inProgressCount}
            remain={remainCount}
          />
          {ip && (
            <DailyReportModal
              completedList={ip.completedList}
              scheduleDays={sch?.days ?? []}
              cumDone={ip.complete}
              cumPlanned={sch?.totalPlanned ?? 0}
              today={ip.today}
              inProgress={inProgressCount}
            />
          )}
          <ProgressDownloadButton today={today} scheduleDays={scheduleDays} />
          <TeamStatsModal />
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
        inProgress={inProgressCount}
        notStarted={remainCount}
        target={s.target}
        inProgressList={inProgressList}
      />

      {/* ===== 금일 설치현황 — 금일 설치대상(예정일 기준) vs 설치완료(저장 기준) ===== */}
      <h2 className="mb-2 mt-5 text-sm font-semibold text-gray-700">
        금일 설치현황
        <span className="ml-1 font-normal text-gray-400">({today.replace(/-/g, ".")})</span>
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-center">
          <p className="text-3xl font-bold tabular-nums text-blue-700">
            {todayPlanned.toLocaleString()}
          </p>
          <p className="mt-1 text-xs font-medium text-blue-700">금일 설치대상</p>
        </div>
        <div className="rounded-2xl border border-green-100 bg-green-50 p-4 text-center">
          <p className="text-3xl font-bold tabular-nums text-green-700">
            {todayDone.toLocaleString()}
          </p>
          <p className="mt-1 text-xs font-medium text-green-700">설치완료</p>
        </div>
      </div>
      {todayPlanned > 0 && (
        <p className="mt-1 text-right text-[11px] text-gray-400">
          금일 달성률 {((todayDone / todayPlanned) * 100).toFixed(1)}%
        </p>
      )}

      {/* ===== 운수사 협의사항 · 설치일정 변경 업로드 (잠금과 무관하게 항상 노출) ===== */}
      <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-700">상세 현황</h2>
        <div className="flex flex-wrap items-center gap-2">
          <ConsultationModal operators={operatorSchedules} />
          <ScheduleUploadModal />
        </div>
      </div>

      {/* ===== 상세 4개 섹션 — 비밀번호 잠금 해제 후 탭으로 열람 ===== */}
      <DashboardDetailTabs
        unlocked={detailUnlocked}
        schedule={
          detailUnlocked ? (
            <>
              <p className="mb-2 text-sm font-bold text-gray-700">
                설치 일정
                <span className="ml-1 font-normal text-gray-400">(예정일 기준 계획 대비 실적)</span>
              </p>
              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                {sch === null ? (
                  <p className="py-8 text-center text-sm text-gray-400">
                    설치 일정 데이터가 없습니다. (예정일 임포트 필요)
                  </p>
                ) : (
                  <ScheduleChart stats={sch} />
                )}
              </section>
            </>
          ) : undefined
        }
        operator={
          detailUnlocked ? (
            <>
              <p className="mb-2 text-sm font-bold text-gray-700">
                운수사별 진행 현황
                <span className="ml-1 font-normal text-gray-400">(작업 시작된 운수사)</span>
              </p>
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
            </>
          ) : undefined
        }
        branch={
          detailUnlocked && ip ? (
            <>
              <p className="mb-2 text-sm font-bold text-gray-700">
                영업소별
                <span className="ml-1 font-normal text-gray-400">(운수사·노선 / 저장 기준)</span>
              </p>
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
          ) : undefined
        }
        date={
          detailUnlocked && ip ? (
            <InstallDateSearch completedList={ip.completedList} today={ip.today} />
          ) : undefined
        }
      />
    </main>
  );
}
