"use client";

import { useState } from "react";

const INPUT =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";
const LABEL = "text-[11px] font-medium text-gray-500";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")); // 24시간 표기
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0")); // 5분 단위

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
function fmtLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
  return `${m}/${d} (${dow})`;
}

interface PlanGroup {
  operator: string;
  route: string;
  planned: number;
}

// 운수사별 입력값 (집합시간은 시/분으로 분리 보관)
interface EntryState {
  hour: string;
  minute: string;
  place: string;
  dayOff: string;
  nextDayOff: string;
}

// '설치계획 보고' 버튼 → 오늘(업무일) 계획을 운수사별로 보여주고 집합시간·장소·휴차를 채워
// 시작보고 채팅방 + 협의사항(사진) 채팅방 두 곳에 카드 전송.
// 설치장소·휴차는 해당 날짜의 운수사 협의사항 데이터가 있으면 자동으로 불러온다.
export default function PlanReportModal({
  today,
  planGroups,
}: {
  today: string; // 업무일 YYYY-MM-DD
  planGroups: PlanGroup[];
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, EntryState>>({});
  const label = fmtLabel(today);

  // 운수사별로 노선·대수 묶기
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

  async function openModal() {
    setOpen(true);
    setStep("form");
    setError(null);
    // 기본 입력값 초기화 후 협의사항 데이터로 설치장소·휴차 프리필
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
      // 불러오기 실패 시 빈 값으로 시작
    }
    setEntries(init);
  }

  function close() {
    setOpen(false);
    setStep("form");
    setBusy(false);
    setError(null);
  }

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
        body: JSON.stringify({ label, groups }),
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

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
      >
        설치계획 보고
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
              <h2 className="text-sm font-bold text-teal-700">
                {step === "done" ? "전송 완료" : "설치계획 보고"}
              </h2>
              <button
                onClick={close}
                className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              {step === "done" ? (
                <div className="py-6 text-center">
                  <p className="text-3xl">✅</p>
                  <p className="mt-2 text-sm font-semibold text-gray-700">
                    두 채팅방(시작보고·협의사항)으로 전송했습니다
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {label} 설치계획 {total.toLocaleString()}대
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    className="mt-4 w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white active:bg-teal-700"
                  >
                    확인
                  </button>
                </div>
              ) : operators.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  오늘({label}) 설치 계획이 없습니다.
                </p>
              ) : (
                <div className="space-y-4">
                  <p className="rounded-lg bg-teal-50 px-3 py-2 text-center text-sm font-bold text-teal-700">
                    {label} 설치계획 {total.toLocaleString()}대
                  </p>
                  <p className="text-[11px] text-gray-400">
                    설치 장소·휴차는 운수사 협의사항에 저장된 내용이 자동으로 채워집니다. 수정
                    가능합니다.
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
                      <div
                        key={o.operator}
                        className="space-y-2 rounded-xl border border-gray-200 p-3"
                      >
                        <p className="text-sm font-bold text-gray-800">
                          {o.operator}{" "}
                          <span className="font-normal text-gray-400">{o.count}대</span>
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

                  {error && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={busy}
                    className="w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white active:bg-teal-700 disabled:opacity-50"
                  >
                    {busy ? "전송 중..." : "두 채팅방으로 보내기"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
