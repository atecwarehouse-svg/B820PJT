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
  const [capOpen, setCapOpen] = useState(false); // 캡쳐 종류 선택 메뉴
  // 캡쳐 결과 팝업 — 페이지별 미리보기·저장 (여러 장 자동 공유가 폰에서 어색하다는 피드백)
  const [capFiles, setCapFiles] = useState<{ name: string; url: string; file: File }[] | null>(
    null,
  );

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

  // 팀 차량 목록을 운수사별로 묶고(가나다순), 안에서는 노선→차량번호 순 정렬
  function groupByOperator(list: Vehicle[]): [string, Vehicle[]][] {
    const m = new Map<string, Vehicle[]>();
    for (const v of list) m.set(v.operator, [...(m.get(v.operator) ?? []), v]);
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "ko"))
      .map(([op, vs]) => [
        op,
        vs.sort(
          (x, y) =>
            x.route.localeCompare(y.route, "ko") || x.plate.localeCompare(y.plate, "ko"),
        ),
      ]);
  }

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

  // 캡쳐 이미지 한 줄(팀 헤더 / 운수사 헤더 / 차량 행) — 높이: 팀 34, 운수사 22, 차량 18
  type CapLine =
    | { kind: "team"; text: string; cnt: number | null }
    | { kind: "op"; text: string; cnt: number | null; team: string }
    | { kind: "veh"; v: Vehicle; team: string; op: string };
  const LINE_H = { team: 34, op: 22, veh: 18 } as const;
  // 페이지당 내용 높이 ≈ 차량 70대 분량 — 한 장이 폰 화면에서 너무 길지 않게 잘게 나눈다
  const MAX_CONTENT_H = 1400;

  function buildCapLines(withVehicles: boolean): CapLine[] {
    const lines: CapLine[] = [];
    for (const [team, list] of teams) {
      lines.push({ kind: "team", text: team, cnt: list.length });
      if (!withVehicles) continue;
      for (const [op, vs] of groupByOperator(list)) {
        lines.push({ kind: "op", text: op, cnt: vs.length, team });
        for (const v of vs) lines.push({ kind: "veh", v, team, op });
      }
    }
    return lines;
  }

  // 높이 기준으로 페이지 분할 — 중간에서 끊기면 다음 페이지에 "(계속)" 헤더를 다시 그린다
  function paginateCapLines(lines: CapLine[]): CapLine[][] {
    const pages: CapLine[][] = [];
    let cur: CapLine[] = [];
    let h = 0;
    for (const ln of lines) {
      if (h + LINE_H[ln.kind] > MAX_CONTENT_H && cur.length) {
        pages.push(cur);
        cur = [];
        h = 0;
        if (ln.kind === "veh") {
          cur.push({ kind: "team", text: `${ln.team} (계속)`, cnt: null });
          cur.push({ kind: "op", text: `${ln.op} (계속)`, cnt: null, team: ln.team });
          h += LINE_H.team + LINE_H.op;
        } else if (ln.kind === "op") {
          cur.push({ kind: "team", text: `${ln.team} (계속)`, cnt: null });
          h += LINE_H.team;
        }
      }
      cur.push(ln);
      h += LINE_H[ln.kind];
    }
    if (cur.length) pages.push(cur);
    return pages;
  }

  function drawCapPage(lines: CapLine[], pageNo: number, pageTotal: number): Promise<Blob | null> {
    const FONT = "'Malgun Gothic', sans-serif";
    const W = 420;
    const headerH = 96;
    const H = headerH + lines.reduce((s, ln) => s + LINE_H[ln.kind], 0) + 20;
    const scale = 2; // 레티나 대응 — 캡쳐가 흐리지 않게
    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    ctx.scale(scale, scale);
    const rightAlign = (text: string) => W - 20 - ctx.measureText(text).width;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0369a1";
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText("설치팀별 설치 현황", 20, 34);
    if (pageTotal > 1) {
      const p = `페이지 ${pageNo}/${pageTotal}`;
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillText(p, rightAlign(p), 34);
    }
    ctx.fillStyle = "#6b7280";
    ctx.font = `12px ${FONT}`;
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

    let y = headerH;
    for (const ln of lines) {
      if (ln.kind === "team") {
        ctx.fillStyle = "#e0f2fe";
        ctx.fillRect(12, y, W - 24, 28);
        ctx.fillStyle = "#0c4a6e";
        ctx.font = `bold 14px ${FONT}`;
        ctx.fillText(ln.text, 20, y + 19);
        if (ln.cnt !== null) {
          const cnt = `${ln.cnt.toLocaleString()}대`;
          ctx.fillText(cnt, rightAlign(cnt), y + 19);
        }
      } else if (ln.kind === "op") {
        ctx.fillStyle = "#0369a1";
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText(
          ln.cnt !== null ? `${ln.text} ${ln.cnt.toLocaleString()}대` : ln.text,
          24,
          y + 15,
        );
      } else {
        ctx.fillStyle = "#1f2937";
        ctx.font = `12px ${FONT}`;
        ctx.fillText(ln.v.plate, 32, y + 13);
        const info = `${ln.v.route} · ${ln.v.date}`;
        ctx.fillStyle = "#6b7280";
        ctx.font = `11px ${FONT}`;
        ctx.fillText(info, rightAlign(info), y + 13);
      }
      y += LINE_H[ln.kind];
    }

    return new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  }

  // '차량 목록 포함' 선택 시 몇 장으로 나뉘는지 — 메뉴 라벨 표시용
  const detailPageCount = useMemo(
    () => (teams.length ? paginateCapLines(buildCapLines(true)).length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teams],
  );

  // 검색 결과를 캔버스에 그려 PNG 생성 → 페이지별 미리보기·저장 팝업을 연다.
  // withVehicles=false면 팀별 요약만, true면 운수사별 묶음·차량번호 목록까지(길면 여러 장).
  async function capture(withVehicles: boolean) {
    setCapOpen(false);
    const pages = paginateCapLines(buildCapLines(withVehicles));
    const files: { name: string; url: string; file: File }[] = [];
    for (let i = 0; i < pages.length; i++) {
      const blob = await drawCapPage(pages[i], i + 1, pages.length);
      if (!blob) continue;
      const suffix = pages.length > 1 ? `_${i + 1}` : "";
      const name = `설치팀별현황_${workToday()}${suffix}.png`;
      const file = new File([blob], name, { type: "image/png" });
      files.push({ name, url: URL.createObjectURL(file), file });
    }
    if (files.length) setCapFiles(files);
  }

  function closeCapModal() {
    capFiles?.forEach((f) => URL.revokeObjectURL(f.url));
    setCapFiles(null);
  }

  // 페이지 1장 저장 — PhotoSlot의 '휴대폰에 저장'과 동일 정책: 공유시트 우선, 폴백은 다운로드
  async function saveCapFile(f: { name: string; url: string; file: File }) {
    if (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [f.file] })
    ) {
      try {
        await navigator.share({ files: [f.file] });
      } catch {
        // 사용자가 공유시트를 닫은 경우 — 아무것도 안 함
      }
    } else {
      const a = document.createElement("a");
      a.href = f.url; // 팝업 미리보기가 쓰는 URL이라 revoke는 팝업 닫을 때만
      a.download = f.name;
      a.click();
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
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setCapOpen((o) => !o)}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm active:bg-sky-700"
            >
              📷 캡쳐하기
            </button>
            {capOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => capture(false)}
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-gray-700 active:bg-sky-50"
                >
                  팀별 요약만
                </button>
                <button
                  type="button"
                  onClick={() => capture(true)}
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-gray-700 active:bg-sky-50"
                >
                  차량 목록 포함
                  {detailPageCount > 1 && ` (${detailPageCount}장 분할)`}
                </button>
              </div>
            )}
          </div>
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
                <div className="space-y-2.5 border-t border-gray-50 bg-gray-50/50 px-3 py-2.5">
                  {groupByOperator(list).map(([op, vs]) => (
                    <div key={op}>
                      <p className="text-[11px] font-semibold text-sky-700">
                        {op} <span className="font-normal text-gray-400">{vs.length}대</span>
                      </p>
                      <ul className="mt-1 space-y-1">
                        {vs.map((v) => (
                          <li
                            key={v.plate}
                            className="flex items-center justify-between rounded bg-white px-2 py-1.5"
                          >
                            <span className="text-xs font-semibold text-gray-800">
                              {v.plate}
                            </span>
                            <span className="ml-2 shrink-0 text-[11px] tabular-nums text-gray-500">
                              {v.route} · {v.date}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* 캡쳐 결과 팝업 — 페이지별 미리보기 + 저장 */}
      {capFiles && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={closeCapModal}
        >
          <div
            className="mb-12 mt-10 w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-bold text-sky-700">
                캡쳐 저장 ({capFiles.length}장)
              </h2>
              <button
                type="button"
                onClick={closeCapModal}
                className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-xs text-gray-500">
                저장 버튼을 누르면 페이지별로 저장(공유)됩니다
              </p>
              {capFiles.map((f, i) => (
                <div key={f.name} className="rounded-xl border border-gray-200 p-2">
                  <div className="flex items-center justify-between px-1 pb-2">
                    <span className="text-xs font-semibold text-gray-700">
                      페이지 {i + 1} / {capFiles.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => saveCapFile(f)}
                      className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm active:bg-sky-700"
                    >
                      저장
                    </button>
                  </div>
                  {/* 미리보기 — 긴 이미지는 위쪽만 보여줌 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.url}
                    alt={f.name}
                    className="max-h-64 w-full rounded-lg border border-gray-100 object-cover object-top"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
