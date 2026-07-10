// 설치 일정 시각화 — 외부 라이브러리 없이 인라인 SVG/CSS.
// (1) 누적 진척 S-curve: 누적 계획 vs 누적 실적
// (2) 일자별 막대: 계획 대수 + 완료 오버레이, 시범설치일 표시
// 서버 컴포넌트(데이터는 부모에서 ScheduleStats로 전달).

import type { ScheduleStats } from "@/lib/stats";

function mmdd(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export default function ScheduleChart({ stats }: { stats: ScheduleStats }) {
  const { days, cumPlanned, cumDone, totalPlanned, totalDone, pilotTotal, pilotDone } = stats;

  if (days.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        설치 예정일 데이터가 없습니다. (npm run import:schedule 필요)
      </p>
    );
  }

  // ---- S-curve (누적) ----
  const W = 600;
  const H = 160;
  const padL = 36;
  const padR = 8;
  const padT = 10;
  const padB = 20;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = days.length;
  const maxY = totalPlanned || 1;
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / maxY) * innerH;

  const plannedPath = cumPlanned.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const donePath = cumDone.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  // 실적 영역 채우기 (바닥까지)
  const doneArea = `${donePath} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;

  // y축 눈금 (0, 1/2, 1)
  const ticks = [0, 0.5, 1].map((f) => Math.round(maxY * f));

  // ---- 일자별 막대 ----
  const maxDaily = Math.max(...days.map((d) => d.planned), 1);
  const BAR_W = 16; // 칸 너비(px)
  const BAR_H = 96; // 막대 영역 높이(px)
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
          <p className="text-xl font-bold tabular-nums text-gray-700">{n}</p>
          <p className="mt-0.5 text-xs text-gray-500">설치 예정일수</p>
        </div>
      </div>

      {/* 누적 S-curve */}
      <div>
        <div className="mb-1 flex items-center gap-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm bg-gray-300" /> 누적 계획
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm bg-green-500" /> 누적 실적
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="누적 진척 곡선">
          {ticks.map((t, i) => {
            const yy = y(t);
            return (
              <g key={i}>
                <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="#f1f1f1" />
                <text x={padL - 4} y={yy + 3} textAnchor="end" fontSize="9" fill="#9ca3af">
                  {t.toLocaleString()}
                </text>
              </g>
            );
          })}
          <path d={doneArea} fill="#22c55e" fillOpacity="0.12" />
          <path d={plannedPath} fill="none" stroke="#9ca3af" strokeWidth="1.5" />
          <path d={donePath} fill="none" stroke="#22c55e" strokeWidth="2" />
        </svg>
      </div>

      {/* 일자별 막대 (가로 스크롤) */}
      <div>
        <div className="mb-1 flex items-center gap-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm bg-blue-200" /> 계획
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm bg-green-500" /> 완료
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-purple-500" /> 시범설치일
          </span>
        </div>
        <div className="overflow-x-auto pb-1">
          <div className="flex items-end gap-[2px]" style={{ minWidth: days.length * (BAR_W + 2) }}>
            {days.map((d, i) => {
              const ph = (d.planned / maxDaily) * BAR_H;
              const dh = (d.done / maxDaily) * BAR_H;
              const showLabel = i % 5 === 0 || i === days.length - 1;
              return (
                <div key={d.date} className="flex flex-col items-center" style={{ width: BAR_W }}>
                  <span className="mb-0.5 text-[8px] tabular-nums text-gray-400">{d.planned}</span>
                  <div
                    className="relative w-full rounded-t bg-blue-200"
                    style={{ height: Math.max(ph, 2) }}
                    title={`${d.date} · 계획 ${d.planned} · 완료 ${d.done}${d.pilot ? ` · 시범 ${d.pilot}` : ""}`}
                  >
                    <div
                      className="absolute bottom-0 left-0 w-full rounded-t bg-green-500"
                      style={{ height: Math.max(dh, d.done > 0 ? 2 : 0) }}
                    />
                  </div>
                  {/* 시범설치일 점 */}
                  <span
                    className={`mt-0.5 inline-block h-1.5 w-1.5 rounded-full ${d.pilot ? "bg-purple-500" : "bg-transparent"}`}
                  />
                  <span className="mt-0.5 h-3 text-[7px] leading-3 tabular-nums text-gray-400">
                    {showLabel ? mmdd(d.date) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
