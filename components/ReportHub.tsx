"use client";

import { useEffect, useState } from "react";

// ── 공통 유틸 ───────────────────────────────────────────────
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
function fmtLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
  return `${m}/${d} (${dow})`;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

interface PlanGroup {
  operator: string;
  route: string;
  planned: number;
}

// 완료 안내 화면 (전송 성공 후) — btnClass는 Tailwind가 스캔할 수 있게 전체 클래스로 전달
function DonePanel({
  title,
  sub,
  onClose,
  btnClass,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  btnClass: string;
}) {
  return (
    <div className="py-6 text-center">
      <p className="text-3xl">✅</p>
      <p className="mt-2 text-sm font-semibold text-gray-700">{title}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
      <button
        type="button"
        onClick={onClose}
        className={`mt-4 w-full rounded-xl py-3 text-sm font-bold text-white ${btnClass}`}
      >
        확인
      </button>
    </div>
  );
}

// ── 1) 설치계획 보고 패널 ────────────────────────────────────
interface EntryState {
  hour: string;
  minute: string;
  place: string;
  dayOff: string;
  nextDayOff: string;
}

function PlanReportPanel({
  today,
  planGroups,
  onClose,
}: {
  today: string;
  planGroups: PlanGroup[];
  onClose: () => void;
}) {
  const INPUT =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";
  const LABEL = "text-[11px] font-medium text-gray-500";
  const label = fmtLabel(today);

  const operators = (() => {
    const m = new Map<string, { routes: { route: string; count: number }[]; count: number }>();
    for (const g of planGroups) {
      const o = m.get(g.operator) ?? { routes: [], count: 0 };
      o.routes.push({ route: g.route, count: g.planned });
      o.count += g.planned;
      m.set(g.operator, o);
    }
    return [...m.entries()].map(([operator, v]) => ({ operator, ...v }));
  })();
  const total = operators.reduce((s, o) => s + o.count, 0);

  const [step, setStep] = useState<"form" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, EntryState>>({});

  // 열릴 때 협의사항(설치장소·휴차)으로 프리필
  useEffect(() => {
    let alive = true;
    (async () => {
      const init: Record<string, EntryState> = {};
      for (const o of operators) {
        init[o.operator] = { hour: "", minute: "00", place: "", dayOff: "", nextDayOff: "" };
      }
      try {
        const res = await fetch(`/api/consultation?date=${today}`, { cache: "no-store" });
        const json = await res.json();
        for (const c of (json.list ?? []) as {
          operator: string;
          place: string | null;
          day_off: string | null;
          next_day_off: string | null;
        }[]) {
          if (init[c.operator]) {
            init[c.operator].place = c.place ?? "";
            init[c.operator].dayOff = c.day_off ?? "";
            init[c.operator].nextDayOff = c.next_day_off ?? "";
          }
        }
      } catch {
        // 실패 시 빈 값
      }
      if (alive) setEntries(init);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  function update(operator: string, patch: Partial<EntryState>) {
    setEntries((e) => ({ ...e, [operator]: { ...e[operator], ...patch } }));
  }

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      const groups = operators.map((o) => {
        const e = entries[o.operator];
        return {
          operator: o.operator,
          routes: o.routes,
          count: o.count,
          time: e?.hour ? `${e.hour}:${e.minute || "00"}` : "",
          place: e?.place ?? "",
          dayOff: e?.dayOff ?? "",
          nextDayOff: e?.nextDayOff ?? "",
        };
      });
      const res = await fetch("/api/plan-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, date: today, groups }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "전송 실패");
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setBusy(false);
    }
  }

  if (step === "done") {
    return (
      <DonePanel
        title="두 채팅방(시작보고·협의사항)으로 전송했습니다"
        sub={`${label} 설치계획 ${total.toLocaleString()}대`}
        onClose={onClose}
        btnClass="bg-teal-600 active:bg-teal-700"
      />
    );
  }

  if (operators.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        오늘({label}) 설치 계획이 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-teal-50 px-3 py-2 text-center text-sm font-bold text-teal-700">
        {label} 설치계획 {total.toLocaleString()}대
      </p>
      <p className="text-[11px] text-gray-400">
        설치 장소·휴차는 운수사 협의사항에 저장된 내용이 자동으로 채워집니다(수정 가능).
        시작보고방 카드에는 휴차가 빠지고, 협의사항방 카드에는 협의사항의
        도착시간·협조확인·단말기 설치위치·특이사항이 함께 표시됩니다.
      </p>

      {operators.map((o) => {
        const e = entries[o.operator] ?? {
          hour: "",
          minute: "00",
          place: "",
          dayOff: "",
          nextDayOff: "",
        };
        return (
          <div key={o.operator} className="space-y-2 rounded-xl border border-gray-200 p-3">
            <p className="text-sm font-bold text-gray-800">
              {o.operator} <span className="font-normal text-gray-400">{o.count}대</span>
            </p>
            <p className="text-xs text-gray-500">
              {o.routes.map((r) => `${r.route} ${r.count}대`).join(" · ")}
            </p>

            <div>
              <span className={LABEL}>집합시간 (24시간)</span>
              <div className="mt-1 flex items-center gap-1.5">
                <select
                  value={e.hour}
                  onChange={(ev) => update(o.operator, { hour: ev.target.value })}
                  className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-teal-500 focus:outline-none"
                >
                  <option value="">--</option>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-gray-500">시</span>
                <select
                  value={e.hour ? e.minute : ""}
                  disabled={!e.hour}
                  onChange={(ev) => update(o.operator, { minute: ev.target.value })}
                  className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-teal-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                >
                  {!e.hour && <option value="">--</option>}
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-gray-500">분</span>
              </div>
            </div>

            <label className="block">
              <span className={LABEL}>설치 장소</span>
              <input
                type="text"
                value={e.place}
                onChange={(ev) => update(o.operator, { place: ev.target.value })}
                placeholder="주소 입력"
                className={INPUT}
              />
            </label>

            <label className="block">
              <span className={LABEL}>당일 휴차</span>
              <input
                type="text"
                value={e.dayOff}
                onChange={(ev) => update(o.operator, { dayOff: ev.target.value })}
                placeholder="차량번호 입력"
                className={INPUT}
              />
            </label>

            <label className="block">
              <span className={LABEL}>익일 휴차</span>
              <input
                type="text"
                value={e.nextDayOff}
                onChange={(ev) => update(o.operator, { nextDayOff: ev.target.value })}
                placeholder="차량번호 입력"
                className={INPUT}
              />
            </label>
          </div>
        );
      })}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSend}
        disabled={busy}
        className="w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white active:bg-teal-700 disabled:opacity-50"
      >
        {busy ? "전송 중..." : "두 채팅방으로 보내기"}
      </button>
    </div>
  );
}

// ── 2)·4) 설치시작 보고 / 진행중 공유 패널 (숫자 카드 공유) ──────
function ShareStatPanel({
  kind,
  today,
  todayPlanned,
  todayDone,
  complete,
  inProgress,
  remain,
  planGroups,
  onClose,
}: {
  kind: "start" | "progress";
  today: string;
  todayPlanned: number;
  todayDone: number;
  complete: number;
  inProgress: number;
  remain: number;
  planGroups: PlanGroup[];
  onClose: () => void;
}) {
  const label = fmtLabel(today);
  const isStart = kind === "start";
  const [sharing, setSharing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function share() {
    if (sharing) return;
    setSharing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/teams/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          label,
          todayPlanned,
          todayDone,
          complete,
          inProgress,
          remain,
          ...(isStart ? { groups: planGroups } : {}),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "전송 실패");
      setMsg({ ok: true, text: "팀즈로 전송되었습니다." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "전송 실패" });
    } finally {
      setSharing(false);
    }
  }

  const rows: [string, number, string][] = isStart
    ? [
        ["금일 설치계획", todayPlanned, "text-gray-700"],
        ...planGroups.map(
          (g): [string, number, string] => [
            `· ${g.operator}${g.route ? ` ${g.route}노선` : ""}`,
            g.planned,
            "text-gray-500",
          ],
        ),
        ["누적 완료", complete, "text-green-700"],
        ["잔여(설치대상)", remain, "text-gray-600"],
      ]
    : [
        ["금일 설치계획", todayPlanned, "text-gray-700"],
        ["진행중", inProgress, "text-amber-600"],
        ["금일완료", todayDone, "text-green-600"],
        ["누적완료", complete, "text-green-700"],
        ["잔여(설치대상)", remain, "text-gray-600"],
      ];

  // Tailwind가 스캔할 수 있게 정적 클래스로 분기
  const headBg = isStart ? "bg-orange-600" : "bg-indigo-600";
  const headSub = isStart ? "text-orange-200" : "text-indigo-200";
  const sendBtn = isStart
    ? "bg-orange-600 hover:bg-orange-700"
    : "bg-indigo-600 hover:bg-indigo-700";

  return (
    <div>
      <p className="mb-2 text-[11px] text-gray-400">아래 내용으로 설치 진행중 공유방에 전송됩니다.</p>
      <div className={`rounded-xl px-4 py-3 text-white ${headBg}`}>
        <p className="text-sm font-bold">
          {isStart ? "B820 단말기 설치 시작 보고" : "🚌 B820 단말기 설치 진행 현황"}
        </p>
        <p className={`text-xs ${headSub}`}>
          {isStart ? `${label} 설치 시작` : `${label} 기준`}
        </p>
      </div>
      <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-100">
        {rows.map(([k, v, color]) => (
          <li key={k} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">{k}</span>
            <span className={`tabular-nums font-bold ${color}`}>{v.toLocaleString()}대</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg bg-gray-100 px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-200"
        >
          닫기
        </button>
        <button
          onClick={share}
          disabled={sharing}
          className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${sendBtn}`}
        >
          {sharing ? "전송 중…" : isStart ? "팀즈로 보고" : "팀즈로 공유"}
        </button>
      </div>
      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      )}
    </div>
  );
}

// ── 3) 운행시작 보고 패널 ────────────────────────────────────
function CheckRow({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 active:bg-gray-100">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-800">{label}</span>
        {desc && <span className="mt-0.5 block text-[11px] text-gray-500">{desc}</span>}
      </span>
    </label>
  );
}

function ServiceStartPanel({ onClose }: { onClose: () => void }) {
  const INPUT =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
  const [step, setStep] = useState<"form" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [driverEdu, setDriverEdu] = useState(false);
  const [fareSetting, setFareSetting] = useState(false);
  const [baseFare, setBaseFare] = useState("");
  const [bisCheck, setBisCheck] = useState(false);
  const [kakaoCheck, setKakaoCheck] = useState(false);
  const [notes, setNotes] = useState("");

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/service-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverEdu, fareSetting, baseFare, bisCheck, kakaoCheck, notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "전송 실패");
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setBusy(false);
    }
  }

  if (step === "done") {
    return (
      <DonePanel
        title="팀즈로 전송했습니다"
        sub="설치 진행중 공유방으로 발송됨"
        onClose={onClose}
        btnClass="bg-emerald-600 active:bg-emerald-700"
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-700">
        첫차 운행시작 전 점검 결과를 공유합니다
      </p>

      <CheckRow
        checked={driverEdu}
        onChange={setDriverEdu}
        label="첫차 운행시작 · 승무사원 교육 완료"
      />

      <CheckRow
        checked={fareSetting}
        onChange={setFareSetting}
        label="단말기 요금세팅 확인"
        desc="다인승 조작으로 기본요금 확인"
      />

      <label className="block">
        <span className="text-[11px] font-medium text-gray-500">기본요금 (원)</span>
        <input
          type="text"
          inputMode="numeric"
          value={baseFare}
          onChange={(e) => setBaseFare(e.target.value)}
          placeholder="예: 1500"
          className={INPUT}
        />
        <span className="mt-1 block text-[11px] text-gray-400">
          버스 문에 붙어있는 요금과 동일한지 확인
        </span>
      </label>

      <CheckRow
        checked={bisCheck}
        onChange={setBisCheck}
        label="BIS 서비스 확인"
        desc="인천시 버스 도착정보 서비스 정상 확인"
      />

      <CheckRow checked={kakaoCheck} onChange={setKakaoCheck} label="카카오 초정밀 버스 정상 유무" />

      <label className="block">
        <span className="text-[11px] font-medium text-gray-500">특이사항</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="점검 중 나온 특이사항"
          className={INPUT}
        />
      </label>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSend}
        disabled={busy}
        className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white active:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? "전송 중..." : "팀즈로 보내기"}
      </button>
    </div>
  );
}

// ── 통합 보고 버튼 + 탭 팝업 ─────────────────────────────────
type TabKey = "plan" | "start" | "service" | "progress";
const TABS: { key: TabKey; label: string }[] = [
  { key: "plan", label: "설치계획 보고" },
  { key: "start", label: "설치시작 보고" },
  { key: "service", label: "운행시작 보고" },
  { key: "progress", label: "진행중 공유" },
];

export default function ReportHub(props: {
  planToday: string; // 업무일 — 설치계획/라벨
  shareToday: string; // 공유 카드 라벨 기준일
  planGroups: PlanGroup[];
  todayPlanned: number;
  todayDone: number;
  complete: number;
  inProgress: number;
  remain: number;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("plan");

  function close() {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTab("plan");
          setOpen(true);
        }}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
      >
        📢 보고
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="mb-12 mt-8 w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-bold text-blue-700">보고 / 공유</h2>
              <button
                onClick={close}
                className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            {/* 탭 바 */}
            <div className="flex gap-1 overflow-x-auto border-b border-gray-100 px-2 py-2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    tab === t.key
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {tab === "plan" && (
                <PlanReportPanel
                  today={props.planToday}
                  planGroups={props.planGroups}
                  onClose={close}
                />
              )}
              {tab === "start" && (
                <ShareStatPanel
                  kind="start"
                  today={props.shareToday}
                  todayPlanned={props.todayPlanned}
                  todayDone={props.todayDone}
                  complete={props.complete}
                  inProgress={props.inProgress}
                  remain={props.remain}
                  planGroups={props.planGroups}
                  onClose={close}
                />
              )}
              {tab === "service" && <ServiceStartPanel onClose={close} />}
              {tab === "progress" && (
                <ShareStatPanel
                  kind="progress"
                  today={props.shareToday}
                  todayPlanned={props.todayPlanned}
                  todayDone={props.todayDone}
                  complete={props.complete}
                  inProgress={props.inProgress}
                  remain={props.remain}
                  planGroups={props.planGroups}
                  onClose={close}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
