// 설치 일정 시각화 — 요약 타일 + 월별 달력(운수사·완료율 표시, 페이지 넘김).
// 서버 컴포넌트(데이터는 부모에서 ScheduleStats로 전달), 달력은 클라이언트 컴포넌트.

import type { ScheduleStats } from "@/lib/stats";
import ScheduleCalendar from "@/components/ScheduleCalendar";

export default function ScheduleChart({ stats }: { stats: ScheduleStats }) {
  const { days, totalPlanned, totalDone, pilotTotal, pilotDone } = stats;

  if (days.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        설치 예정일 데이터가 없습니다. (npm run import:schedule 필요)
      </p>
    );
  }

  const donePct = totalPlanned ? ((totalDone / totalPlanned) * 100).toFixed(1) : "0.0";
  // 본설치 = 전체 − 시범설치 (시범설치 = 예정일이 PILOT_CUTOFF 이전인 차량)
  const mainTotal = totalPlanned - pilotTotal;
  const mainDone = totalDone - pilotDone;

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <div className="rounded-xl bg-blue-50 p-3">
          <p className="text-xl font-bold tabular-nums text-blue-700">
            {totalDone.toLocaleString()}
            <span className="text-sm font-medium text-gray-400"> / {totalPlanned.toLocaleString()}</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-500">전체 일정 진척 ({donePct}%)</p>
        </div>
        <div className="rounded-xl bg-purple-50 p-3">
          <p className="text-xl font-bold tabular-nums text-purple-700">
            {pilotDone.toLocaleString()}
            <span className="text-sm font-medium text-gray-400"> / {pilotTotal.toLocaleString()}</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-500">시범설치</p>
        </div>
        <div className="rounded-xl bg-sky-50 p-3">
          <p className="text-xl font-bold tabular-nums text-sky-700">
            {mainDone.toLocaleString()}
            <span className="text-sm font-medium text-gray-400"> / {mainTotal.toLocaleString()}</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-500">본설치</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-xl font-bold tabular-nums text-gray-700">{days.length}</p>
          <p className="mt-0.5 text-xs text-gray-500">설치 예정일수</p>
        </div>
      </div>

      {/* 월별 달력 — 칸 탭하면 운수사별 상세 */}
      <ScheduleCalendar days={days} />
    </div>
  );
}
