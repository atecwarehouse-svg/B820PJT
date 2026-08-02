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

// 설치팀 그룹 — 팀명 앞부분(지역명)으로 소속사 구분. 팀 구성이 바뀌면 여기만 수정.
const TEAM_GROUPS: [string, string[]][] = [
  ["아림기술", ["김포", "부천", "금화", "대구", "의정부", "아림"]],
  ["모리원", ["용인", "광명", "평택", "인천"]],
];

function groupOf(team: string): string | null {
  for (const [g, prefixes] of TEAM_GROUPS) {
    if (prefixes.some((p) => team.startsWith(p))) return g;
  }
  return null;
}

// 설치팀별 확인 — 기간·운수사·노선 필터 후 팀별 대수 + 차량 목록(차량번호) 표시.
// 데이터는 서버에서 전체를 받아(최대 수천 행) 클라이언트에서 필터링한다.
export default function TeamsClient({ vehicles }: { vehicles: Vehicle[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [operator, setOperator] = useState("");
  const [route, setRoute] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [group, setGroup] = useState("");
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

  // 팀명 검색은 부분 일치 — "부천" 입력 시 부천1·부천2가 모두 잡힌다
  const q = teamQuery.trim();
  const filtered = useMemo(
    () =>
      vehicles.filter(
        (v) =>
          (!from || v.date >= from) &&
          (!to || v.date <= to) &&
          (!operator || v.operator === operator) &&
          (!route || v.route === route) &&
          (!q || v.team.includes(q)) &&
          (!group || groupOf(v.team) === group),
      ),
    [vehicles, from, to, operator, route, q, group],
  );

  const teams = useMemo(() => {
    const m = new Map<string, Vehicle[]>();
    for (const v of filtered) m.set(v.team, [...(m.get(v.team) ?? []), v]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko"));
  }, [filtered]);

  const hasFilter = from || to || operator || route || q || group;

  // 현재 검색 조건 요약 문구 — 캡쳐 이미지 머리글용
  function filterLabel(): string {
    const parts: string[] = [];
    if (from || to) parts.push(`${from || "…"} ~ ${to || "…"}`);
    else parts.push("전체 기간");
    if (group) parts.push(group);
    if (operator) parts.push(operator);
    if (route) parts.push(route);
    if (q) parts.push(`팀 "${q}"`);
    return parts.join(" · ");
  }

  // 검색 결과를 캔버스에 그려 PNG로 저장 — 공유시트(모바일) 우선, 미지원이면 다운로드.
  // 화면 스크린샷 대신 직접 그려서 필터 조건·합계가 항상 포함된 깔끔한 이미지가 나온다.
  async function capture() {
    const W = 420;
    const headerH = 96;
    const rowH = 36;
    const H = headerH + teams.length * rowH + 28;
    const scale = 2; // 레티나 대응 — 캡쳐가 흐리지 않게
    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0369a1";
    ctx.font = "bold 18px 'Malgun Gothic', sans-serif";
    ctx.fillText("설치팀별 설치 현황", 20, 34);
    ctx.fillStyle = "#6b7280";
    ctx.font = "12px 'Malgun Gothic', sans-serif";
    ctx.fillText(filterLabel(), 20, 58);
    ctx.fillText(
      `합계 ${filtered.length.toLocaleString()}대 · ${new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date())} 기준`,
      20,
      76,
    );

    teams.forEach(([team, list], i) => {
      const y = headerH + i * rowH;
      if (i % 2 === 0) {
        ctx.fillStyle = "#f0f9ff";
        ctx.fillRect(12, y, W - 24, rowH);
      }
      ctx.fillStyle = "#1f2937";
      ctx.font = "14px 'Malgun Gothic', sans-serif";
      ctx.fillText(team, 20, y + 23);
      const cnt = `${list.length.toLocaleString()}대`;
      ctx.fillStyle = "#0369a1";
      ctx.font = "bold 14px 'Malgun Gothic', sans-serif";
      ctx.fillText(cnt, W - 20 - ctx.measureText(cnt).width, y + 23);
    });

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) return;
    const name = `설치팀별현황_${workToday()}.png`;
    const file = new File([blob], name, { type: "image/png" });
    // PhotoSlot의 '휴대폰에 저장'과 동일 정책 — 공유시트 우선, 폴백은 다운로드
    if (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({ files: [file] });
      } catch {
        // 사용자가 공유시트를 닫은 경우 — 아무것도 안 함
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

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
        {/* 그룹(소속사)별 보기 */}
        <div className="mt-2 flex gap-1.5">
          {["", ...TEAM_GROUPS.map(([g]) => g)].map((g) => (
            <button
              key={g || "전체"}
              type="button"
              onClick={() => setGroup(g)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium ${
                group === g
                  ? "bg-sky-600 text-white"
                  : "border border-gray-300 bg-white text-gray-600 active:bg-gray-100"
              }`}
            >
              {g || "그룹 전체"}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={teamQuery}
          onChange={(e) => setTeamQuery(e.target.value)}
          placeholder="팀명 검색 (예: 부천 → 부천1·부천2 모두)"
          className="mt-2 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
        />
        {hasFilter && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
              setOperator("");
              setRoute("");
              setTeamQuery("");
              setGroup("");
            }}
            className="mt-2 w-full rounded-lg bg-gray-100 py-1.5 text-xs font-medium text-gray-600 active:bg-gray-200"
          >
            검색 초기화
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          검색 결과 <b className="text-sky-700">{filtered.length.toLocaleString()}대</b> · 팀을
          누르면 차량 목록 표시
        </p>
        {teams.length > 0 && (
          <button
            type="button"
            onClick={capture}
            className="shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm active:bg-sky-700"
          >
            📷 캡쳐하기
          </button>
        )}
      </div>

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
