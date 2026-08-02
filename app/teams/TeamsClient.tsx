"use client";

import { useMemo, useState } from "react";

interface Vehicle {
  plate: string;
  operator: string;
  route: string;
  team: string; // 정규화된 팀명
  date: string; // 설치일(업무일) YYYY-MM-DD
}

// 오늘의 업무일 "YYYY-MM-DD" — lib/work-day.ts workDateString과 동일 규칙(KST −12h).
// 서버 함수는 클라이언트에서 못 쓰므로 같은 계산을 여기서 수행한다.
function workToday(): string {
  const shifted = new Date(Date.now() - 12 * 3600000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(shifted);
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// 설치팀별 확인 — 기간·운수사·노선 필터 후 팀별 대수 + 차량 목록(차량번호) 표시.
// 데이터는 서버에서 전체를 받아(최대 수천 행) 클라이언트에서 필터링한다.
export default function TeamsClient({ vehicles }: { vehicles: Vehicle[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [operator, setOperator] = useState("");
  const [route, setRoute] = useState("");
  const [openTeam, setOpenTeam] = useState<string | null>(null);

  const operators = useMemo(
    () =>
      [...new Set(vehicles.map((v) => v.operator))].sort((a, b) => a.localeCompare(b, "ko")),
    [vehicles],
  );
  // 노선 선택지는 운수사 선택 시 그 운수사 노선만
  const routes = useMemo(() => {
    const base = operator ? vehicles.filter((v) => v.operator === operator) : vehicles;
    return [...new Set(base.map((v) => v.route))].sort((a, b) => a.localeCompare(b, "ko"));
  }, [vehicles, operator]);

  const filtered = useMemo(
    () =>
      vehicles.filter(
        (v) =>
          (!from || v.date >= from) &&
          (!to || v.date <= to) &&
          (!operator || v.operator === operator) &&
          (!route || v.route === route),
      ),
    [vehicles, from, to, operator, route],
  );

  const teams = useMemo(() => {
    const m = new Map<string, Vehicle[]>();
    for (const v of filtered) m.set(v.team, [...(m.get(v.team) ?? []), v]);
    return [...m.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ko"),
    );
  }, [filtered]);

  const hasFilter = from || to || operator || route;

  return (
    <div className="mt-4">
      {/* 검색 필터 */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        {/* 기간 빠른 선택 — 한 번 탭으로 기간 적용 */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(() => {
            const today = workToday();
            const presets: [string, string, string][] = [
              ["오늘", today, today],
              ["어제", addDays(today, -1), addDays(today, -1)],
              ["최근 7일", addDays(today, -6), today],
              ["이번 달", today.slice(0, 8) + "01", today],
              ["전체", "", ""],
            ];
            return presets.map(([label, f, t]) => {
              const active = from === f && to === t;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setFrom(f);
                    setTo(t);
                  }}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    active
                      ? "bg-sky-600 text-white"
                      : "bg-gray-100 text-gray-600 active:bg-gray-200"
                  }`}
                >
                  {label}
                </button>
              );
            });
          })()}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            aria-label="시작일"
          />
          <span className="text-xs text-gray-400">~</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            aria-label="종료일"
          />
        </div>
        <div className="mt-2 flex gap-2">
          <select
            value={operator}
            onChange={(e) => {
              setOperator(e.target.value);
              setRoute(""); // 운수사가 바뀌면 노선 선택 초기화
            }}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          >
            <option value="">운수사 전체</option>
            {operators.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <select
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          >
            <option value="">노선 전체</option>
            {routes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {hasFilter && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
              setOperator("");
              setRoute("");
            }}
            className="mt-2 w-full rounded-lg bg-gray-100 py-1.5 text-xs font-medium text-gray-600 active:bg-gray-200"
          >
            검색 초기화
          </button>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-500">
        검색 결과 <b className="text-sky-700">{filtered.length.toLocaleString()}대</b> · 팀을
        누르면 차량 목록이 표시됩니다
      </p>

      {teams.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">조건에 맞는 차량이 없습니다.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {teams.map(([team, list]) => (
            <li key={team}>
              <button
                type="button"
                onClick={() => setOpenTeam(openTeam === team ? null : team)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-sky-50"
              >
                <span className="text-sm font-medium text-gray-800">
                  {team}
                  <span className="ml-1 text-xs text-gray-400">
                    {openTeam === team ? "▲" : "▼"}
                  </span>
                </span>
                <span className="text-sm font-bold tabular-nums text-sky-700">
                  {list.length.toLocaleString()}대
                </span>
              </button>
              {openTeam === team && (
                <ul className="space-y-1 border-t border-gray-50 bg-gray-50/50 px-3 py-2.5">
                  {list.map((v) => (
                    <li
                      key={v.plate}
                      className="flex items-center justify-between rounded bg-white px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800">{v.plate}</p>
                        <p className="truncate text-[11px] text-gray-500">
                          {v.operator} · {v.route}
                        </p>
                      </div>
                      <span className="ml-2 shrink-0 text-[11px] tabular-nums text-gray-500">
                        {v.date}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
