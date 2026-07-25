"use client";

import { Fragment, useState } from "react";
import type { ScheduleDay } from "@/lib/stats";
import { workDateString } from "@/lib/work-day";

// 설치 일정 달력 — 월별 페이지 넘김. 칸에 예정 대수 + 운수사명(축약),
// 칸 색은 대수(진할수록 많음), 하단 초록 줄 = 완료율, ✓ = 전량 완료, 보라 점 = 시범설치일.
// 칸을 탭하면 운수사별 상세 팝업.

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

// 운수사명 축약 — 좁은 칸에 들어가게 ㈜/(주) 등 제거 후 5자까지
function shortOp(name: string): string {
  const s = name.replace(/㈜|\(주\)|주식회사|\s/g, "");
  return s.length > 5 ? s.slice(0, 5) : s;
}

function dowOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export default function ScheduleCalendar({ days }: { days: ScheduleDay[] }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const today = workDateString(new Date()); // 업무일 기준(다른 화면의 '금일'과 동일)

  // 일정이 있는 달 목록 (YYYY-MM, 오름차순)
  const months = [...new Set(days.map((d) => d.date.slice(0, 7)))].sort();
  const todayMonth = today.slice(0, 7);
  const initIdx = (() => {
    const i = months.indexOf(todayMonth);
    if (i >= 0) return i;
    if (todayMonth > months[months.length - 1]) return months.length - 1;
    return 0;
  })();
  const [idx, setIdx] = useState(initIdx);
  const [popup, setPopup] = useState<ScheduleDay | null>(null);

  if (months.length === 0) return null;
  const month = months[idx];
  const [yy, mm] = month.split("-").map(Number);
  const firstDow = new Date(Date.UTC(yy, mm - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const maxPlanned = Math.max(...days.map((d) => d.planned), 1);

  // 대수 → 칸 배경(파랑 4단계, 진할수록 많음)
  function cellBg(planned: number): string {
    if (!planned) return "bg-gray-50";
    const f = planned / maxPlanned;
    if (f < 0.25) return "bg-blue-100";
    if (f < 0.5) return "bg-blue-200";
    if (f < 0.75) return "bg-blue-300";
    return "bg-blue-400";
  }

  return (
    <div>
      {/* 월 페이지 넘김 */}
      <div className="mb-2 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          className="rounded-lg border border-gray-300 px-3 py-1 text-sm font-bold text-gray-600 active:bg-gray-100 disabled:opacity-30"
          aria-label="이전 달"
        >
          ◀
        </button>
        <p className="w-28 text-center text-sm font-bold text-gray-800">
          {yy}년 {mm}월
        </p>
        <button
          type="button"
          onClick={() => setIdx((i) => Math.min(months.length - 1, i + 1))}
          disabled={idx === months.length - 1}
          className="rounded-lg border border-gray-300 px-3 py-1 text-sm font-bold text-gray-600 active:bg-gray-100 disabled:opacity-30"
          aria-label="다음 달"
        >
          ▶
        </button>
      </div>

      {/* 달력 */}
      <div className="grid grid-cols-7 gap-[3px]">
        {DOW.map((w, i) => (
          <div
            key={w}
            className={`py-0.5 text-center text-[9px] ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-400"}`}
          >
            {w}
          </div>
        ))}
        {Array.from({ length: firstDow }, (_, i) => (
          <div key={`b${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const dd = i + 1;
          const date = `${month}-${String(dd).padStart(2, "0")}`;
          const d = byDate.get(date);
          const pct = d && d.planned > 0 ? (d.done / d.planned) * 100 : 0;
          const full = !!d && d.planned > 0 && d.done >= d.planned;
          const ops = d?.ops ?? [];
          return (
            <button
              key={date}
              type="button"
              disabled={!d}
              onClick={() => d && setPopup(d)}
              className={`relative flex min-h-[58px] flex-col items-center overflow-hidden rounded-lg p-0.5 text-center ${cellBg(d?.planned ?? 0)} ${
                date === today ? "ring-2 ring-inset ring-blue-600" : ""
              } ${d ? "active:opacity-80" : ""}`}
            >
              <span className="self-start pl-0.5 text-[8px] leading-3 text-gray-400">{dd}</span>
              {d && (
                <>
                  <span className="text-[13px] font-extrabold leading-4 tabular-nums text-gray-800">
                    {d.planned}
                  </span>
                  <span className="w-full truncate text-[7.5px] leading-[10px] text-gray-600">
                    {ops[0] ? shortOp(ops[0].operator) : ""}
                  </span>
                  <span className="w-full truncate text-[7.5px] leading-[10px] text-gray-600">
                    {ops.length === 2
                      ? shortOp(ops[1].operator)
                      : ops.length > 2
                        ? `외 ${ops.length - 1}곳`
                        : ""}
                  </span>
                  {/* 완료율 줄 */}
                  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-black/10">
                    <span
                      className="block h-full bg-green-600"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  {full && (
                    <span className="absolute bottom-[3px] right-0.5 text-[8px] font-extrabold text-green-700">
                      ✓
                    </span>
                  )}
                  {d.pilot > 0 && (
                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-purple-500" />
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* 범례 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded bg-blue-300" /> 진할수록 대수 많음
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-[3px] w-3 rounded bg-green-600" /> 완료율
        </span>
        <span>✓ 전량 완료</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-purple-500" /> 시범설치
        </span>
      </div>

      {/* 일자 상세 팝업 */}
      {popup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPopup(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-gray-800">
                  {Number(popup.date.slice(5, 7))}/{Number(popup.date.slice(8, 10))} (
                  {DOW[dowOf(popup.date)]})
                  {popup.date === today && (
                    <span className="ml-1.5 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      오늘
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  계획 {popup.planned.toLocaleString()}대 · 완료{" "}
                  <b className="text-green-600">{popup.done.toLocaleString()}대</b>
                  {popup.pilot > 0 && (
                    <span className="text-purple-600"> · 시범 {popup.pilot}대</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPopup(null)}
                className="rounded-md px-2 py-0.5 text-lg leading-none text-gray-400 active:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <ul className="max-h-80 space-y-1.5 overflow-y-auto">
              {(popup.ops ?? []).map((o) => (
                <li key={o.operator} className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="mr-2 truncate font-semibold text-gray-800">
                      {o.operator}
                    </span>
                    <span className="shrink-0 tabular-nums text-gray-500">
                      {o.done > 0 && <b className="text-green-600">{o.done}/</b>}
                      {o.count}대
                    </span>
                  </div>
                  {(o.routes ?? []).length > 0 && (
                    <div className="mt-0.5 text-xs text-gray-600">
                      <span className="text-gray-400">노선</span>
                      <div className="mt-0.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                        {o.routes!.map((r) => (
                          <Fragment key={r.route}>
                            <span className="truncate">{r.route}</span>
                            <span className="text-right tabular-nums">{r.count}대</span>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                  {(o.models ?? []).length > 0 && (
                    <div className="mt-0.5 text-xs text-gray-600">
                      <span className="text-gray-400">모델</span>
                      <div className="mt-0.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                        {o.models!.map((m) => (
                          <Fragment key={m.model}>
                            <span className="truncate">{m.model}</span>
                            <span className="text-right tabular-nums">{m.count}대</span>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                  {o.address && (
                    <p className="mt-0.5 text-[11px] leading-4 text-gray-400">
                      📍 {o.address}
                    </p>
                  )}
                </li>
              ))}
              {(popup.ops ?? []).length === 0 && (
                <li className="py-2 text-center text-xs text-gray-400">
                  운수사 정보가 없습니다. (잠시 후 새로고침)
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
