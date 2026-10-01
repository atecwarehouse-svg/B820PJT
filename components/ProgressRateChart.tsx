"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ScheduleDay } from "@/lib/stats";
import { workDateString } from "@/lib/work-day";

// 진척율 — 설치 일정 옆 탭. 일별/주별/월별로 계획(예정일 기준 대수)과 실적(완료 업무일 기준 대수)을
// 막대로, 누적 진척율(누적 실적 ÷ 전체 계획)을 꺾은선으로 그린다. 아래 표는 같은 숫자.
//   - 일 = 업무일, 주 = 월요일 시작("M/D~M/D"), 달 = "YYYY년 M월".
//   - 계획·실적이 하나도 없는 중간 기간도 0으로 채워 축이 끊기지 않게 한다.
//   - 한 화면에 기간을 PAGE_SIZE개씩 보여주고 ◀ ▶ 로 이전/다음 기간을 넘긴다. 처음엔 현재 기간이 오른쪽 끝 근처.
//   - 오늘(업무일)이 속한 기간까지만 누적선을 그린다(미래 기간은 계획 막대만). 누적은 전체 기간 기준(넘겨도 이어짐).

type Mode = "day" | "week" | "month";
interface Row {
  key: string; // 정렬·식별용 (일: 날짜, 주: 월요일 날짜, 달: YYYY-MM)
  label: string; // 표용
  axis: string[]; // 차트 x축 (2줄)
  planned: number;
  done: number;
  cumPlanned: number;
  cumDone: number;
  future: boolean; // 오늘 이후에 시작하는 기간
  current: boolean; // 오늘이 속한 기간
}

const DAY_MS = 86400000;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const MODES: { key: Mode; label: string; size: number; wPer: number }[] = [
  { key: "day", label: "일별", size: 14, wPer: 40 },
  { key: "week", label: "주별", size: 10, wPer: 48 },
  { key: "month", label: "월별", size: 12, wPer: 60 },
];

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
function dow(date: string): string {
  return DOW[new Date(utc(date)).getUTCDay()];
}

function buildRows(mode: Mode, days: ScheduleDay[], doneByDate: { date: string; done: number }[], today: string): Row[] {
  const keyOf = mode === "day" ? (d: string) => d : mode === "week" ? weekStart : monthKey;
  const planned = new Map<string, number>();
  const done = new Map<string, number>();
  for (const d of days) planned.set(keyOf(d.date), (planned.get(keyOf(d.date)) ?? 0) + d.planned);
  for (const d of doneByDate) done.set(keyOf(d.date), (done.get(keyOf(d.date)) ?? 0) + d.done);
  const keys = [...new Set([...planned.keys(), ...done.keys()])].sort();
  if (!keys.length) return [];

  // 빈 기간 채우기 (첫 기간 ~ 마지막 기간, 오늘이 그 밖이면 오늘까지)
  const todayKey = keyOf(today);
  const first = keys[0] < todayKey ? keys[0] : todayKey;
  const last = keys[keys.length - 1] > todayKey ? keys[keys.length - 1] : todayKey;
  const all: string[] = [];
  if (mode === "month") {
    for (let k = first; k <= last; k = addMonth(k, 1)) all.push(k);
  } else {
    const step = mode === "day" ? DAY_MS : 7 * DAY_MS;
    for (let t = utc(first); t <= utc(last); t += step) all.push(ymd(t));
  }

  let cp = 0;
  let cd = 0;
  return all.map((k) => {
    const p = planned.get(k) ?? 0;
    const d = done.get(k) ?? 0;
    cp += p;
    cd += d;
    let label: string;
    let axis: string[];
    if (mode === "day") {
      label = `${md(k)} (${dow(k)})`;
      axis = [md(k), dow(k)];
    } else if (mode === "week") {
      const end = ymd(utc(k) + 6 * DAY_MS);
      label = `${md(k)}~${md(end)}`;
      axis = [md(k), `~${md(end)}`];
    } else {
      label = `${k.slice(0, 4)}년 ${Number(k.slice(5, 7))}월`;
      axis = [`${Number(k.slice(5, 7))}월`, k.slice(0, 4)];
    }
    return { key: k, label, axis, planned: p, done: d, cumPlanned: cp, cumDone: cd, future: k > todayKey, current: k === todayKey };
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
  const [page, setPage] = useState(0); // 0 = 현재 기간이 보이는 화면, +1 = 한 화면 이전, −1 = 한 화면 이후
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = workDateString(new Date());
  const rows = useMemo(() => buildRows(mode, days, doneByDate, today), [mode, days, doneByDate, today]);
  const totalPlanned = days.reduce((a, d) => a + d.planned, 0);
  const totalDone = doneByDate.reduce((a, d) => a + d.done, 0);
  const cfg = MODES.find((m) => m.key === mode)!;

  // 보이는 구간 — 처음엔 현재 기간이 오른쪽 끝에서 두 번째(다음 기간 하나만 미리 보임)
  const size = Math.min(cfg.size, rows.length);
  const curIdx = Math.max(0, rows.findIndex((r) => r.current));
  const anchorEnd = Math.min(rows.length, Math.max(size, curIdx + 2));
  const end = Math.min(rows.length, Math.max(size, anchorEnd - page * size));
  const start = Math.max(0, end - size);
  const visible = rows.slice(start, end);
  const canPrev = start > 0;
  const canNext = end < rows.length;

  useEffect(() => {
    // 가로 스크롤이 생기면 오른쪽 끝(현재 기간)이 보이게
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [mode, page, rows.length]);

  if (!rows.length) {
    return <p className="py-8 text-center text-sm text-gray-400">설치 예정일 데이터가 없습니다.</p>;
  }

  // ----- SVG 레이아웃 -----
  const W_PER = cfg.wPer;
  const PAD_L = 34;
  const PAD_R = 36;
  const PAD_T = 14;
  const PAD_B = 34;
  const H = 220;
  const plotH = H - PAD_T - PAD_B;
  const W = PAD_L + visible.length * W_PER + PAD_R;
  const maxBar = Math.max(1, ...visible.map((r) => Math.max(r.planned, r.done)));
  const yBar = (v: number) => PAD_T + plotH - (v / maxBar) * plotH;
  const yPct = (p: number) => PAD_T + plotH - (p / 100) * plotH;
  const xOf = (i: number) => PAD_L + i * W_PER + W_PER / 2;
  const cumPct = (r: Row) => (totalPlanned ? (r.cumDone / totalPlanned) * 100 : 0);
  const pastIdx = visible.map((r, i) => (r.future ? -1 : i)).filter((i) => i >= 0);
  const linePts = pastIdx.map((i) => `${xOf(i)},${yPct(cumPct(visible[i]))}`).join(" ");
  const barW = Math.floor((W_PER - 12) / 2);
  const overallPct = totalPlanned ? (totalDone / totalPlanned) * 100 : 0;
  const yTicks = [0, 25, 50, 75, 100];
  const lastV = visible[visible.length - 1];
  const rangeLabel =
    mode === "month"
      ? `${visible[0].label} ~ ${lastV.label}`
      : `${md(visible[0].key)} ~ ${mode === "week" ? md(ymd(utc(lastV.key) + 6 * DAY_MS)) : md(lastV.key)}`;
  const navBtn =
    "rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-bold text-gray-600 active:bg-gray-100 disabled:opacity-30";

  return (
    <div className="space-y-3">
      {/* 요약 + 일/주/월 토글 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          누적 진척율{" "}
          <b className="text-lg tabular-nums text-blue-700">{overallPct.toFixed(1)}%</b>
          <span className="ml-1 text-xs text-gray-400">
            ({totalDone.toLocaleString()} / {totalPlanned.toLocaleString()}대)
          </span>
        </p>
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-bold">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => {
                setMode(m.key);
                setPage(0);
              }}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                mode === m.key ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* 기간 넘김 */}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setPage((p) => p + 1)} disabled={!canPrev} aria-label="이전 기간" className={navBtn}>
          ◀
        </button>
        <p className="flex items-center gap-2 text-xs font-semibold text-gray-700">
          {rangeLabel}
          {page !== 0 && (
            <button
              type="button"
              onClick={() => setPage(0)}
              className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-600"
            >
              현재로
            </button>
          )}
        </p>
        <button type="button" onClick={() => setPage((p) => p - 1)} disabled={!canNext} aria-label="다음 기간" className={navBtn}>
          ▶
        </button>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-200" />계획(예정일)</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />실적(완료일)</span>
        <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 rounded bg-orange-500" />누적 진척율(전체 계획 대비)</span>
      </div>

      {/* 차트 — 기간이 많으면 가로 스크롤 */}
      <div ref={scrollRef} className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
        <svg width={W} height={H} className="block" role="img" aria-label={`${cfg.label} 진척율 차트`}>
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
          {visible.map((r, i) => {
            const x = PAD_L + i * W_PER;
            return (
              <g key={r.key}>
                {r.current && <rect x={x} y={PAD_T} width={W_PER} height={plotH} fill="#eff6ff" />}
                <rect x={x + 6} y={yBar(r.planned)} width={barW} height={yBar(0) - yBar(r.planned)} fill="#bfdbfe" rx={2} />
                <rect x={x + 6 + barW} y={yBar(r.done)} width={barW} height={yBar(0) - yBar(r.done)} fill={r.future ? "#d1fae5" : "#10b981"} rx={2} />
                {r.planned > 0 && (
                  <text x={x + 6 + barW / 2} y={yBar(r.planned) - 2} fontSize={8} fill="#60a5fa" textAnchor="middle">{r.planned}</text>
                )}
                {r.done > 0 && (
                  <text x={x + 6 + barW + barW / 2} y={yBar(r.done) - 2} fontSize={8} fill="#059669" textAnchor="middle">{r.done}</text>
                )}
                <text x={xOf(i)} y={H - PAD_B + 12} fontSize={8} fill={r.current ? "#1d4ed8" : "#6b7280"} fontWeight={r.current ? 700 : 400} textAnchor="middle">
                  {r.axis[0]}
                </text>
                <text x={xOf(i)} y={H - PAD_B + 22} fontSize={8} fill="#9ca3af" textAnchor="middle">
                  {r.axis[1]}
                </text>
              </g>
            );
          })}
          <line x1={PAD_L} x2={W - PAD_R} y1={yBar(0)} y2={yBar(0)} stroke="#e5e7eb" />
          {linePts && <polyline points={linePts} fill="none" stroke="#f97316" strokeWidth={2} strokeLinejoin="round" />}
          {pastIdx.map((i) => (
            <g key={"pt" + visible[i].key}>
              <circle cx={xOf(i)} cy={yPct(cumPct(visible[i]))} r={2.5} fill="#f97316" />
              <text x={xOf(i)} y={yPct(cumPct(visible[i])) - 5} fontSize={8} fill="#ea580c" textAnchor="middle">
                {cumPct(visible[i]).toFixed(0)}%
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
              <th className="px-2 py-1.5 text-left font-medium">{mode === "day" ? "일" : mode === "week" ? "주" : "월"}</th>
              <th className="px-2 py-1.5 text-right font-medium">계획</th>
              <th className="px-2 py-1.5 text-right font-medium">실적</th>
              <th className="px-2 py-1.5 text-right font-medium">기간 진척율</th>
              <th className="px-2 py-1.5 text-right font-medium">누적 실적</th>
              <th className="px-2 py-1.5 text-right font-medium">누적 진척율</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 tabular-nums">
            {visible.map((r) => {
              const periodPct = r.planned ? (r.done / r.planned) * 100 : null;
              return (
                <tr key={r.key} className={r.current ? "bg-blue-50 font-semibold" : r.future ? "text-gray-400" : ""}>
                  <td className="whitespace-nowrap px-2 py-1.5">{r.label}{r.current && <span className="ml-1 text-[10px] text-blue-600">현재</span>}</td>
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
        계획은 차량리스트 설치 예정일, 실적은 사진 전부 저장된 완료 업무일(20시~익일 12시) 기준. 누적 실적 열은 「누적 실적 / 그때까지 누적 계획」(화면을 넘겨도 처음부터 이어서 누적).
      </p>
    </div>
  );
}
