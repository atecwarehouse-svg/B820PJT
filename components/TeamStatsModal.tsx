"use client";

import { useState } from "react";

interface TeamRow {
  team: string;
  count: number;
}

interface TeamVehicle {
  plate: string;
  operator: string | null;
  saved_at: string;
}

// '설치팀 확인' 버튼 → 팀별 누적 설치(저장) 대수 팝업.
// 팀을 누르면 그 팀이 설치한 차량(운수사별 차량번호)이 펼쳐진다.
export default function TeamStatsModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [total, setTotal] = useState(0);
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  // 팀별 차량 목록 캐시 — 한 번 불러온 팀은 재요청하지 않음
  const [vehicles, setVehicles] = useState<Record<string, TeamVehicle[]>>({});
  const [vehLoading, setVehLoading] = useState<string | null>(null);

  async function openModal() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setOpenTeam(null);
    setVehicles({});
    try {
      const res = await fetch("/api/install-teams", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "불러오기 실패");
      setTeams(json.teams ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }

  async function toggleTeam(team: string) {
    if (openTeam === team) {
      setOpenTeam(null);
      return;
    }
    setOpenTeam(team);
    if (vehicles[team]) return;
    setVehLoading(team);
    try {
      const res = await fetch(`/api/install-teams?team=${encodeURIComponent(team)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "불러오기 실패");
      setVehicles((v) => ({ ...v, [team]: json.vehicles ?? [] }));
    } catch {
      setVehicles((v) => ({ ...v, [team]: [] }));
    } finally {
      setVehLoading(null);
    }
  }

  // 차량 목록을 운수사별로 묶기
  function groupByOperator(list: TeamVehicle[]) {
    const m = new Map<string, string[]>();
    for (const v of list) {
      const op = v.operator?.trim() || "미지정";
      m.set(op, [...(m.get(op) ?? []), v.plate]);
    }
    return [...m.entries()];
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-sky-700"
      >
        설치팀 확인
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="mb-12 mt-10 w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-bold text-sky-700">설치팀별 누적 현황</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              {loading ? (
                <p className="py-8 text-center text-sm text-gray-400">불러오는 중…</p>
              ) : error ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
              ) : teams.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  아직 설치(저장) 완료된 차량이 없습니다.
                </p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-gray-500">
                    누적 설치 <b className="text-sky-700">{total.toLocaleString()}대</b> · 팀을
                    누르면 설치한 차량이 표시됩니다
                  </p>
                  <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                    {teams.map((t) => (
                      <li key={t.team}>
                        <button
                          type="button"
                          onClick={() => toggleTeam(t.team)}
                          className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-sky-50"
                        >
                          <span className="text-sm font-medium text-gray-800">
                            {t.team}
                            <span className="ml-1 text-xs text-gray-400">
                              {openTeam === t.team ? "▲" : "▼"}
                            </span>
                          </span>
                          <span className="text-sm font-bold tabular-nums text-sky-700">
                            {t.count.toLocaleString()}대
                          </span>
                        </button>
                        {openTeam === t.team && (
                          <div className="border-t border-gray-50 bg-gray-50/50 px-3 py-2.5">
                            {vehLoading === t.team ? (
                              <p className="py-2 text-center text-xs text-gray-400">
                                불러오는 중…
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {groupByOperator(vehicles[t.team] ?? []).map(([op, plates]) => (
                                  <div key={op}>
                                    <p className="text-[11px] font-semibold text-sky-700">
                                      {op}{" "}
                                      <span className="font-normal text-gray-400">
                                        {plates.length}대
                                      </span>
                                    </p>
                                    <ul className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1">
                                      {plates.map((p) => (
                                        <li
                                          key={p}
                                          className="rounded bg-white px-2 py-1 text-xs text-gray-700"
                                        >
                                          {p}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
