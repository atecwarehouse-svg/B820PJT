import Link from "next/link";
import { unstable_cache } from "next/cache";
import { loadStats } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 집계 결과를 60초 캐시 — 실시간일 필요 없어 매 접속마다 재계산하지 않음
const getStats = unstable_cache(() => loadStats(), ["dashboard-stats"], {
  revalidate: 60,
});

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "amber" | "gray";
}) {
  const toneClass = {
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    gray: "bg-gray-50 text-gray-600",
  }[tone];
  return (
    <div className={`rounded-xl p-3 text-center ${toneClass}`}>
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-xs">{label}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const s = await getStats();
  const pct = s.totalVehicles ? (s.complete / s.totalVehicles) * 100 : 0;

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

      {/* 전체 진행률 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm text-gray-500">전체 차량 완료율</p>
            <p className="mt-1 text-3xl font-bold text-blue-700 tabular-nums">
              {s.complete.toLocaleString()}
              <span className="text-lg font-medium text-gray-400">
                {" "}
                / {s.totalVehicles.toLocaleString()}대
              </span>
            </p>
          </div>
          <span className="text-2xl font-bold text-blue-700 tabular-nums">{pct.toFixed(1)}%</span>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-right text-[11px] text-gray-400">1대당 {s.target}장 기준</p>
      </section>

      {/* 상태 카드 */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatCard label="완료" value={s.complete} tone="green" />
        <StatCard label="진행중" value={s.inProgress} tone="amber" />
        <StatCard label="미시작" value={s.notStarted} tone="gray" />
      </div>

      {/* 운수사별 진행 현황 */}
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
    </main>
  );
}
