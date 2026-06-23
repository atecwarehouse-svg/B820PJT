"use client";

import { useMemo, useState } from "react";
import type { CompletedVehicle } from "@/lib/stats";

// 진행현황 — 업무일(20:00~익일 07:00)로 완료 차량을 날짜 검색.
export default function InstallDateSearch({
  completedList,
  today,
}: {
  completedList: CompletedVehicle[];
  today: string;
}) {
  const [date, setDate] = useState(today); // 기본: 현재 업무일

  const matched = useMemo(
    () => (date ? completedList.filter((c) => c.workDate === date) : []),
    [completedList, date],
  );

  // 영업소(운수사·노선)별 묶기
  const groups = useMemo(() => {
    const m = new Map<string, { operator: string; route: string; plates: string[] }>();
    for (const c of matched) {
      const key = `${c.operator}|||${c.route}`;
      const g = m.get(key) ?? { operator: c.operator, route: c.route, plates: [] };
      g.plates.push(c.plate);
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.plates.length - a.plates.length);
  }, [matched]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-gray-700">날짜별 완료 검색</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setDate(today)}
          className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
        >
          오늘
        </button>
        <span className="ml-auto text-sm tabular-nums text-gray-500">
          완료 <span className="font-bold text-green-700">{matched.length}</span>대
        </span>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">
        작업 교대(20:00~익일 07:00) 기준 — 새벽 완료는 전날로 집계됩니다.
      </p>

      {!date ? (
        <p className="py-6 text-center text-sm text-gray-400">날짜를 선택하세요.</p>
      ) : matched.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">{date}에 완료된 차량이 없습니다.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
          {groups.map((g) => (
            <li key={`${g.operator}|${g.route}`} className="px-3 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {g.operator}
                  {g.route && <span className="ml-1 text-xs font-normal text-gray-400">{g.route}</span>}
                </span>
                <span className="tabular-nums text-green-700">{g.plates.length}대</span>
              </div>
              <div className="mt-0.5 text-xs text-gray-500">{g.plates.join(", ")}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
