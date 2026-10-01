"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ScheduleDay } from "@/lib/stats";
import { workDateString } from "@/lib/work-day";

// 진척율 — 설치 일정 옆 탭. 주별/월별로 계획(예정일 기준 대수)과 실적(완료 업무일 기준 대수)을
// 막대로, 누적 진척율(누적 실적 ÷ 전체 계획)을 꺾은선으로 그린다. 아래 표는 같은 숫자.
//   - 주 = 월요일 시작, 라벨 "M/D~M/D". 달 = "YYYY년 M월".
//   - 계획·실적이 하나도 없는 중간 주/달도 0으로 채워 축이 끊기지 않게 한다.
//   - 오늘(업무일)이 속한 기간까지만 누적선을 그린다(미래 기간은 계획 막대만).

type Mode = "week" | "month";
interface Row {
  key: string; // 정렬·식별용 (주: 월요일 날짜, 달: YYYY-MM)
  label: string;
  planned: number;
  done: number;
  cumPlanned: number;
  cumDone: number;
  future: boolean; // 오늘 이후에 시작하는 기간
}

const DAY_MS = 86400000;

function utc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function ymd(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}
/** 그 날이 속한 주의 월요일 */
function weekStart(date: string): string {
  const t = utc(date);
  const dow = new Date(t).getUTCDay(); // 0=일
  return ymd(t - ((dow + 6) % 7) * DAY_MS);
}
function monthKey(date: string): string {
  return date.slice(0, 7);
}
function addMonth(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}
function md(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

function buildRows(mode: Mode, days: ScheduleDay[], doneByDate: { date: string; done: number }[], today: string): Row[] {
  const keyOf = mode === "week" ? weekStart : monthKey;
  const planned = new Map<string, number>();
  const done = new Map<string, number>();
  for (const d of days) planned.set(keyOf(d.date), (planned.get(keyOf(d.date)) ?? 0) + d.planned);
  for (const d of doneByDate) done.set(keyOf(d.date), (done.get(keyOf(d.date)) ?? 0) + d.done);
  const keys = [...new Set([...planned.keys(), ...done.keys()])].sort();
  if (!keys.length) return [];

  // 빈 기간 채우기 (첫 기간 ~ 마지막 기간)
  const all: string[] = [];
  if (mode === "week") {
    for (let t = utc(keys[0]); t <= utc(keys[keys.length - 1]); t += 7 * DAY_MS) all.push(ymd(t));
  } else {
    for (let k = keys[0]; k <= keys[keys.length - 1]; k = addMonth(k, 1)) all.push(k);
  }

  const todayKey = keyOf(today);
  let cp = 0;
  let cd = 0;
  return all.map((k) => {
    const p = planned.get(k) ?? 0;
    const d = done.get(k) ?? 0;
    cp += p;
    cd += d;
    const label =
      mode === "week"
        ? `${md(k)}~${md(ymd(utc(k) + 6 * DAY_MS))}`
        : `${k.slice(0, 4)}년 ${Number(k.slice(5, 7))}월`;
    return { key: k, label, planned: p, done: d, cumPlanned: cp, cumDone: cd, future: k > todayKey };
  });
}

export default function ProgressRateChart({
  days,
  doneByDate,
}: {
  days: ScheduleDay[];
  doneByDate: { date: string; done: number }[];
}) {
  const [mode, setMode] = useState<Mode>("week");
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = workDateString(new Date());
  const rows = useMemo(() => buildRows(mode, days, doneByDate, today), [mode, days, doneByDate, today]);
  // 기간이 많아 가로 스크롤이 생기면 현재 기간(오른쪽 끝 근처)이 보이게 끝으로 민다
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [mode, rows.length]);
  const totalPlanned = days.reduce((a, d) => a + d.planned, 0);
  const totalDone = doneByDate.reduce((a, d) => a + d.done, 0);

  if (!rows.length) {
    return <p className="py-8 text-center text-sm text-gray-400">설치 예정일 데이터가 없습니다.</p>;
  }

  // ----- SVG 레이아웃 -----
  const W_PER = mode === "week" ? 48 : 72; // 기간 하나의 폭(px)
  const PAD_L = 34;
  const PAD_R = 36;
  const PAD_T = 14;
  const PAD_B = 34;
  const H = 220;
  const plotH = H - PAD_T - PAD_B;
  const W = PAD_L + rows.length * W_PER + PAD_R;
  const maxBar = Math.max(1, ...rows.map((r) => Math.max(r.planned, r.done)));
  const yBar = (v: number) => PAD_T + plotH - (v / maxBar) * plotH;
  const yPct = (p: number) => PAD_T + plotH - (p / 100) * plotH;
  const xOf = (i: number) => PAD_L + i * W_PER;
  const cumPct = (r: Row) => (totalPlanned ? (r.cumDone / totalPlanned) * 100 : 0);
  const linePts = rows
    .filter((r) => !r.future)
    .map((r) => `${xOf(rows.indexOf(r)) + W_PER / 2},${yPct(cumPct(r))}`)
    .join(" ");
  const barW = Math.floor((W_PER - 12) / 2);
  const overallPct = totalPlanned ? (totalDone / totalPlanned) * 100 : 0;
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div className="space-y-3">
      {/* 요약 + 주/월 토글 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          누적 진척율{" "}
          <b className="text-lg tabular-nums text-blue-700">{overallPct.toFixed(1)}%</b>
          <span className="ml-1 text-xs text-gray-400">
            ({totalDone.toLocaleString()} / {totalPlanned.toLocaleString()}대)
          </span>
        </p>
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-bold">
          {(["week", "month"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                mode === m ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"
              }`}
            >
              {m === "week" ? "주별" : "월별"}
            </button>
          ))}
        </div>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-200" />계획(예정일)</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />실적(완료일)</span>
        <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 rounded bg-orange-500" />누적 진척율(전체 계획 대비)</span>
      </div>

      {/* 차트 — 기간이 많으면 가로 스크롤 */}
      <div ref={scrollRef} className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
        <svg width={W} height={H} className="block" role="img" aria-label={`${mode === "week" ? "주별" : "월별"} 진척율 차트`}>
          {/* 오른쪽 % 눈금선 */}
          {yTicks.map((p) => (
            <g key={p}>
              <line x1={PAD_L} x2={W - PAD_R} y1={yPct(p)} y2={yPct(p)} stroke="#f3f4f6" />
              <text x={W - PAD_R + 4} y={yPct(p) + 3.5} fontSize={9} fill="#9ca3af">{p}%</text>
            </g>
          ))}
          {/* 왼쪽 대수 눈금 (최대·절반) */}
          {[maxBar, Math.round(maxBar / 2)].map((v) => (
            <text key={v} x={PAD_L - 4} y={yBar(v) + 3.5} fontSize={9} fill="#9ca3af" textAnchor="end">{v}</text>
          ))}
          {rows.map((r, i) => {
            const x = xOf(i);
            const isNow = !r.future && (i === rows.length - 1 || rows[i + 1].future);
            return (
              <g key={r.key}>
                {isNow && <rect x={x} y={PAD_T} width={W_PER} height={plotH} fill="#eff6ff" />}
                <rect x={x + 6} y={yBar(r.planned)} width={barW} height={yBar(0) - yBar(r.planned)} fill="#bfdbfe" rx={2} />
                <rect x={x + 6 + barW} y={yBar(r.done)} width={barW} height={yBar(0) - yBar(r.done)} fill={r.future ? "#d1fae5" : "#10b981"} rx={2} />
                {r.planned > 0 && (
                  <text x={x + 6 + barW / 2} y={yBar(r.planned) - 2} fontSize={8} fill="#60a5fa" textAnchor="middle">{r.planned}</text>
                )}
                {r.done > 0 && (
                  <text x={x + 6 + barW + barW / 2} y={yBar(r.done) - 2} fontSize={8} fill="#059669" textAnchor="middle">{r.done}</text>
                )}
                <text x={x + W_PER / 2} y={H - PAD_B + 12} fontSize={8} fill={isNow ? "#1d4ed8" : "#6b7280"} fontWeight={isNow ? 700 : 400} textAnchor="middle">
                  {mode === "week" ? r.label.split("~")[0] : r.label.replace(/^\d{4}년 /, "")}
                </text>
                {mode === "week" && (
                  <text x={x + W_PER / 2} y={H - PAD_B + 22} fontSize={8} fill="#9ca3af" textAnchor="middle">
                    ~{r.label.split("~")[1]}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={PAD_L} x2={W - PAD_R} y1={yBar(0)} y2={yBar(0)} stroke="#e5e7eb" />
          {linePts && <polyline points={linePts} fill="none" stroke="#f97316" strokeWidth={2} strokeLinejoin="round" />}
          {rows
            .filter((r) => !r.future)
            .map((r) => (
              <g key={"pt" + r.key}>
                <circle cx={xOf(rows.indexOf(r)) + W_PER / 2} cy={yPct(cumPct(r))} r={2.5} fill="#f97316" />
                <text x={xOf(rows.indexOf(r)) + W_PER / 2} y={yPct(cumPct(r)) - 5} fontSize={8} fill="#ea580c" textAnchor="middle">
                  {cumPct(r).toFixed(0)}%
                </text>
              </g>
            ))}
        </svg>
      </div>

      {/* 표 */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[420px] text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">{mode === "week" ? "주" : "월"}</th>
              <th className="px-2 py-1.5 text-right font-medium">계획</th>
              <th className="px-2 py-1.5 text-right font-medium">실적</th>
              <th className="px-2 py-1.5 text-right font-medium">기간 진척율</th>
              <th className="px-2 py-1.5 text-right font-medium">누적 실적</th>
              <th className="px-2 py-1.5 text-right font-medium">누적 진척율</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 tabular-nums">
            {rows.map((r, i) => {
              const isNow = !r.future && (i === rows.length - 1 || rows[i + 1].future);
              const periodPct = r.planned ? (r.done / r.planned) * 100 : null;
              return (
                <tr key={r.key} className={isNow ? "bg-blue-50 font-semibold" : r.future ? "text-gray-400" : ""}>
                  <td className="px-2 py-1.5 whitespace-nowrap">{r.label}{isNow && <span className="ml-1 text-[10px] text-blue-600">현재</span>}</td>
                  <td className="px-2 py-1.5 text-right">{r.planned.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right text-emerald-700">{r.future ? "-" : r.done.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right">{r.future || periodPct === null ? "-" : `${periodPct.toFixed(0)}%`}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">{r.future ? "-" : `${r.cumDone.toLocaleString()} / ${r.cumPlanned.toLocaleString()}`}</td>
                  <td className="px-2 py-1.5 text-right text-orange-600">{r.future ? "-" : `${cumPct(r).toFixed(1)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">
        계획은 차량리스트 설치 예정일, 실적은 사진 전부 저장된 완료 업무일(20시~익일 12시) 기준. 누적 실적 열은 「누적 실적 / 그때까지 누적 계획」.
      </p>
    </div>
  );
}
