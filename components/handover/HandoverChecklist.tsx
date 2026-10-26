"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HandoverStatusSheet from "./HandoverStatusSheet";
import HandoverVerifySheet from "./HandoverVerifySheet";

interface Worker {
  center: string;
  rank: string;
  name: string;
}
interface Vehicle {
  plate: string;
  operator: string;
  route: string;
  done_at: string | null;
  done_by: string | null;
  note: string | null;
  model?: string | null; // OS업데이트: 기종
  bus_type?: string | null; // OS업데이트: "시내버스" | "마을버스" (양도양수는 null → 구분 UI 숨김)
  center?: string | null; // OS업데이트: 차량별 센터
}

const POLL_MS = 5000;
const BUS_TYPES = ["시내버스", "마을버스"] as const;
export const typeEmoji = (t: string | null | undefined) => (t === "마을버스" ? "🚐" : "🚌");
// OS업데이트: 완료 체크 전 재확인 문구(통합+승하차 단말기 모두 적용했는지)
const OSUPDATE_CONFIRM = "통합+승하차 전체 적용하셨나요?";
// ponytail: 5초 폴링 — 동시 사용자가 수십 명을 넘으면 Supabase Realtime(anon select 정책+publication)으로 교체
export const shortRoute = (route: string) =>
  route
    .split(" / ")
    .map((r) => r.replace(/\(.*$/, "").trim())
    .join(" / ");

const KST = "Asia/Seoul";
export function fmtDone(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: KST });
  const day = d.toLocaleDateString("sv-SE", { timeZone: KST });
  const hm = d.toLocaleTimeString("ko-KR", { timeZone: KST, hour: "2-digit", minute: "2-digit", hour12: false });
  return day === today ? hm : `${day.slice(5).replace("-", "/")} ${hm}`;
}

// 내 센터 차량 체크리스트(모바일) — 큰 완료 토글, 노선별 묶음, 요약 %, 5초 폴링으로 동료 체크 반영.
//   osupdate 면 완료 체크 전 "통합+승하차 전체 적용하셨나요?" 확인, 시내/마을버스 구분 탭.
export default function HandoverChecklist({ worker, kind = "handover" }: { worker: Worker; kind?: string }) {
  const osupdate = kind === "osupdate";
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [offices, setOffices] = useState<string[]>([]);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "todo" | "done">("all");
  const [routeTab, setRouteTab] = useState<string>("all"); // 노선 탭 — "all" 또는 route 값
  const [typeTab, setTypeTab] = useState<string>("all"); // 시내/마을버스 탭(OS업데이트) — "all" 또는 bus_type
  const [q, setQ] = useState("");
  const [noteFor, setNoteFor] = useState<Vehicle | null>(null);
  const [noteText, setNoteText] = useState("");
  const [toast, setToast] = useState("");
  const [statusOpen, setStatusOpen] = useState(false); // 📊 전체 센터 현황표 시트
  const [verifyOpen, setVerifyOpen] = useState(false); // 🔎 서버 등록 검증(차량단말기버전 파일) 시트
  const pendingRef = useRef(new Set<string>()); // 저장 중인 차량 — 폴링 결과로 덮지 않는다
  const seqRef = useRef(0);

  const show = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const res = await fetch("/api/handover", { cache: "no-store" });
      if (res.status === 401) {
        router.refresh(); // 쿠키 만료·비밀번호 변경 → 로그인 화면
        return;
      }
      const j = (await res.json()) as { vehicles?: Vehicle[]; offices?: string[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "불러오기 실패");
      if (seq !== seqRef.current) return;
      setOffices(j.offices ?? []);
      setVehicles((prev) => {
        const next = j.vehicles ?? [];
        if (!prev || !pendingRef.current.size) return next;
        const mine = new Map(prev.map((v) => [v.plate, v]));
        return next.map((v) => (pendingRef.current.has(v.plate) ? mine.get(v.plate) ?? v : v));
      });
      setSyncedAt(Date.now());
      setError("");
    } catch (e) {
      if (seq === seqRef.current) setError(e instanceof Error ? e.message : "불러오기 실패");
    }
  }, [router]);

  useEffect(() => {
    load();
    const tick = () => {
      if (document.visibilityState === "visible") load();
    };
    const id = setInterval(tick, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  async function save(plate: string, body: { done?: boolean; note?: string }) {
    pendingRef.current.add(plate);
    const before = vehicles?.find((v) => v.plate === plate);
    try {
      const res = await fetch("/api/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate, ...body }),
      });
      if (res.status === 401) {
        router.refresh();
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { vehicle?: Vehicle; error?: string };
      if (!res.ok || !j.vehicle) throw new Error(j.error ?? "저장 실패");
      setVehicles((prev) => prev?.map((v) => (v.plate === plate ? j.vehicle! : v)) ?? prev);
    } catch (e) {
      if (before) setVehicles((prev) => prev?.map((v) => (v.plate === plate ? before : v)) ?? prev);
      show(e instanceof Error ? e.message : "저장 실패");
    } finally {
      pendingRef.current.delete(plate);
    }
  }

  function toggle(v: Vehicle) {
    const done = !v.done_at;
    const me = worker.rank ? `${worker.rank} ${worker.name}` : worker.name;
    // 완료 해제는 잘못 누르기 쉬우니 항상 재확인(본인 것도) — 누가 완료했는지 함께 보여 준다
    if (!done) {
      const who = v.done_by ? (v.done_by === me ? "내가" : `${v.done_by}님이`) : "이미";
      if (!window.confirm(`${v.plate}\n${who} 완료한 차량입니다. 완료를 해제할까요?`)) return;
    } else if (osupdate && !window.confirm(`${v.plate}\n${OSUPDATE_CONFIRM}`)) {
      return;
    }
    // 낙관적 반영 — 서버 응답으로 덮는다
    setVehicles((prev) =>
      prev?.map((x) => (x.plate === v.plate ? { ...x, done_at: done ? new Date().toISOString() : null, done_by: done ? me : null } : x)) ?? prev,
    );
    void save(v.plate, { done });
  }

  function openNote(v: Vehicle) {
    setNoteFor(v);
    setNoteText(v.note ?? "");
  }

  async function saveNote() {
    if (!noteFor) return;
    const plate = noteFor.plate;
    const note = noteText.trim();
    setNoteFor(null);
    setVehicles((prev) => prev?.map((x) => (x.plate === plate ? { ...x, note: note || null } : x)) ?? prev);
    await save(plate, { note });
  }

  const list = vehicles ?? [];
  const total = list.length;
  const done = list.filter((v) => v.done_at).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  // OS업데이트 프로젝트(bus_type 있음)만 시내/마을버스 구분 UI
  const hasType = list.some((v) => v.bus_type);
  const typeStats = BUS_TYPES.map((t) => {
    const xs = list.filter((v) => v.bus_type === t);
    return { t, total: xs.length, done: xs.filter((v) => v.done_at).length };
  }).filter((s) => s.total > 0);

  // 노선별 묶음 — 공동배차(route "A / B / C") 차량은 각 노선에 모두 들어간다(노선 대수 = 로우데이터 행 수). 전체 대수는 차량 기준(중복 없음).
  //   구분 탭(시내/마을)이 켜져 있으면 그 구분 차량만으로 묶는다.
  const groups = useMemo(() => {
    const qq = q.replace(/\s+/g, "").toLowerCase();
    const m = new Map<string, { all: Vehicle[]; shown: Vehicle[]; type: string | null }>();
    for (const v of vehicles ?? []) {
      if (typeTab !== "all" && v.bus_type !== typeTab) continue;
      const pass = (filter === "all" || (filter === "done") === !!v.done_at) && (!qq || v.plate.toLowerCase().includes(qq));
      for (const route of v.route.split(" / ")) {
        const g = m.get(route) ?? { all: [], shown: [], type: v.bus_type ?? null };
        g.all.push(v);
        if (pass) g.shown.push(v);
        m.set(route, g);
      }
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "ko"));
  }, [vehicles, filter, q, typeTab]);
  // 구분 탭 안의 합계(요약 막대·'전체' 노선 탭 숫자용)
  const scoped = typeTab === "all" ? list : list.filter((v) => v.bus_type === typeTab);
  const scopedDone = scoped.filter((v) => v.done_at).length;

  const shownGroups = routeTab === "all" ? groups : groups.filter(([route]) => route === routeTab);
  const ago = syncedAt ? Math.max(0, Math.round((now - syncedAt) / 1000)) : null;
  const chip = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${on ? "bg-gray-900 text-white ring-gray-900" : "bg-white text-gray-600 ring-black/10 active:bg-gray-50"}`;

  return (
    <div className="space-y-3">
      {/* 작업자 줄 */}
      <div className="flex items-center justify-between gap-2">
        <span className="pill min-w-0 text-xs">
          <span className="truncate">
            👤 {worker.rank ? `${worker.rank} ` : ""}
            {worker.name} · <b>{worker.center}</b>
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => setStatusOpen(true)} className="pill-muted px-2.5 text-xs" aria-label="전체 센터 현황표" title="현황표">
            📊
          </button>
          <button type="button" onClick={() => setVerifyOpen(true)} className="pill-muted px-2.5 text-xs" aria-label="서버 등록 검증" title="검증">
            🔎
          </button>
          <button type="button" onClick={() => load()} className="pill-muted text-xs" aria-label="새로고침">
            🔄 {ago === null ? "…" : `${ago}초 전`}
          </button>
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/handover/login", { method: "DELETE" }).catch(() => {});
              router.refresh();
            }}
            className="pill-muted text-xs"
          >
            변경
          </button>
        </div>
      </div>

      {/* 요약 */}
      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 motion-safe:animate-rise">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500">{worker.center} 진행률</p>
            <p className="mt-0.5 text-4xl font-bold tabular-nums tracking-tight text-gray-900">
              {pct}
              <span className="text-xl text-gray-400">%</span>
            </p>
          </div>
          <div className="text-right text-sm">
            <p>
              <span className="text-2xl font-bold tabular-nums text-green-600">{done}</span>
              <span className="text-gray-400"> / {total}대</span>
            </p>
            <p className="text-xs text-gray-400">남은 차량 {total - done}대</p>
          </div>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full rounded-full transition-all ${pct === 100 && total ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
        </div>
        {/* OS업데이트: 시내/마을버스별 진행 */}
        {hasType && typeStats.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-b border-gray-100 pb-2.5">
            {typeStats.map((s) => {
              const p = Math.round((s.done / s.total) * 100);
              return (
                <li key={s.t} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 truncate font-bold text-gray-800">
                    {typeEmoji(s.t)} {s.t}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span className={`block h-full rounded-full ${p === 100 ? "bg-green-500" : "bg-indigo-400"}`} style={{ width: `${p}%` }} />
                  </span>
                  <span className="w-14 shrink-0 text-right tabular-nums text-gray-500">
                    {s.done}/{s.total}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {groups.length > 1 && (
          <ul className="mt-3 space-y-1.5">
            {groups.map(([route, g]) => {
              const d = g.all.filter((v) => v.done_at).length;
              const p = g.all.length ? Math.round((d / g.all.length) * 100) : 0;
              return (
                <li key={route} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 truncate font-semibold text-gray-700">{shortRoute(route)}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span className={`block h-full rounded-full ${p === 100 ? "bg-green-500" : "bg-blue-400"}`} style={{ width: `${p}%` }} />
                  </span>
                  <span className="w-14 shrink-0 text-right tabular-nums text-gray-500">
                    {d}/{g.all.length}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {vehicles && total === 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {osupdate
              ? `${worker.center} 차량이 없습니다. 관리자 「차량 업로드」에서 센터 열이 있는 OS적용리스트를 올리면 보입니다.`
              : offices.length
                ? "내 센터 영업소에 등록된 차량이 없습니다."
                : `${worker.center}에 배정된 영업소가 없습니다. 관리자 「센터 배정」에서 영업소를 배정해야 차량이 보입니다.`}
          </p>
        )}
      </section>

      {/* 구분 탭(OS업데이트) — 전체 / 시내버스 / 마을버스 */}
      {hasType && typeStats.length > 1 && (
        <div className="flex gap-1.5">
          {[{ t: "all", total, done }, ...typeStats].map((s) => {
            const on = typeTab === s.t;
            return (
              <button
                key={s.t}
                type="button"
                onClick={() => {
                  setTypeTab(s.t);
                  setRouteTab("all");
                }}
                className={`flex-1 whitespace-nowrap rounded-xl px-2 py-2 text-xs font-semibold ring-1 transition-colors ${
                  on ? "bg-indigo-600 text-white ring-indigo-600 shadow-sm" : "bg-white text-gray-700 ring-black/5 active:bg-indigo-50"
                }`}
              >
                {s.t === "all" ? "전체" : `${typeEmoji(s.t)} ${s.t}`}
                <span className={`ml-1 tabular-nums ${on ? "text-indigo-100" : s.done === s.total && s.total ? "text-green-600" : "text-gray-400"}`}>
                  {s.done}/{s.total}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 노선 탭 — 전체 + 노선별(완료/전체). 가로 스크롤 */}
      {groups.length > 1 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
          {[["all", null] as const, ...groups.map(([route, g]) => [route, g] as const)].map(([key, g]) => {
            const on = routeTab === key;
            const d = g ? g.all.filter((v) => v.done_at).length : scopedDone;
            const t = g ? g.all.length : scoped.length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setRouteTab(key)}
                className={`shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold ring-1 transition-colors ${
                  on ? "bg-blue-600 text-white ring-blue-600 shadow-sm" : "bg-white text-gray-700 ring-black/5 active:bg-blue-50"
                }`}
              >
                {g ? shortRoute(key) : "전체"}
                <span className={`ml-1 tabular-nums ${on ? "text-blue-100" : d === t && t ? "text-green-600" : "text-gray-400"}`}>
                  {d}/{t}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 필터 */}
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          inputMode="search"
          placeholder="차량번호 검색 (예: 6704)"
          className="min-w-0 flex-1 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <button type="button" onClick={() => setFilter("all")} className={chip(filter === "all")}>
          전체
        </button>
        <button type="button" onClick={() => setFilter("todo")} className={chip(filter === "todo")}>
          미완료
        </button>
        <button type="button" onClick={() => setFilter("done")} className={chip(filter === "done")}>
          완료
        </button>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      {/* 노선별 리스트 */}
      {vehicles === null ? (
        <p className="py-10 text-center text-sm text-gray-400">차량 목록 불러오는 중…</p>
      ) : (
        shownGroups.map(([route, g]) =>
          g.shown.length === 0 ? null : (
            <section key={route}>
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <h2 className="text-sm font-bold text-gray-800">
                  {typeEmoji(g.type)} {shortRoute(route)}
                  <span className="ml-1.5 text-xs font-normal text-gray-400">{g.all[0]?.operator}</span>
                </h2>
                <span className="text-xs tabular-nums text-gray-500">
                  {g.all.filter((v) => v.done_at).length}/{g.all.length}
                </span>
              </div>
              <ul className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                {g.shown.map((v) => {
                  const isDone = !!v.done_at;
                  return (
                    <li key={v.plate} className={`flex items-center gap-3 px-3 py-2 ${isDone ? "bg-green-50/60" : ""}`}>
                      <button type="button" onClick={() => openNote(v)} className="min-w-0 flex-1 text-left" aria-label={`${v.plate} 메모`}>
                        <p className={`text-lg font-bold tracking-tight ${isDone ? "text-green-800" : "text-gray-900"}`}>{v.plate}</p>
                        <p className="truncate text-xs text-gray-500">
                          {isDone ? `✔ ${v.done_by ?? ""} · ${fmtDone(v.done_at!)}` : "미완료"}
                          {v.note && <span className="ml-1.5 text-amber-700">📝 {v.note}</span>}
                          {!v.note && <span className="ml-1.5 text-gray-300">메모</span>}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle(v)}
                        aria-pressed={isDone}
                        className={`h-14 w-24 shrink-0 rounded-xl text-sm font-bold transition-transform active:scale-95 ${
                          isDone ? "bg-green-600 text-white shadow-sm" : "bg-white text-gray-500 ring-2 ring-gray-200"
                        }`}
                      >
                        {isDone ? "✅ 완료" : "미완료"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
        )
      )}
      {vehicles && total > 0 && shownGroups.every(([, g]) => g.shown.length === 0) && (
        <p className="py-6 text-center text-sm text-gray-400">조건에 맞는 차량이 없습니다.</p>
      )}

      {/* 메모 시트 */}
      {noteFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setNoteFor(null)}>
          <div className="w-full max-w-md rounded-t-3xl bg-white p-4 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-bold text-gray-900">📝 {noteFor.plate} 메모</p>
            <p className="mt-0.5 text-xs text-gray-400">
              {shortRoute(noteFor.route)} · {noteFor.done_at ? `완료 ${noteFor.done_by ?? ""} ${fmtDone(noteFor.done_at)}` : "미완료"}
            </p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value.slice(0, 200))}
              rows={3}
              autoFocus
              placeholder="특이사항 (예: 단말기 고장, 재방문 필요) — 200자"
              className="mt-3 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setNoteFor(null)} className="rounded-xl bg-gray-100 px-4 py-3 text-sm font-medium text-gray-600">
                취소
              </button>
              <button type="button" onClick={saveNote} className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700">
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {statusOpen && <HandoverStatusSheet onClose={() => setStatusOpen(false)} />}
      {verifyOpen && <HandoverVerifySheet onClose={() => setVerifyOpen(false)} />}

      {toast && (
        <div className="fixed left-1/2 top-16 z-[70] -translate-x-1/2 rounded-full bg-gray-900/90 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}
