"use client";

import { useMemo, useState } from "react";
import type { CompletedVehicle } from "@/lib/stats";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
function fmtLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
  return `${m}/${d} (${dow})`;
}

interface VocState {
  voc: string;
  dayOff: boolean;
}

// '운수사 VOC' 버튼 → 팝업. 최근 설치 완료된 운수사를 고르면 그 운수사·설치일의
// 차량번호가 자동으로 나열되고, 차량마다 VOC를 적는다. 금일 휴차로 체크한 차량은
// 카드 내용에서 빠진다. 결과는 팀즈(설치 진행중 공유방) 카드로 전송.
export default function VocModal({ completedList }: { completedList: CompletedVehicle[] }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "done">("form");
  const [operator, setOperator] = useState("");
  const [date, setDate] = useState("");
  const [state, setState] = useState<Record<string, VocState>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 운수사 → 완료 업무일 → 차량. completedList는 workDate 최신순으로 들어온다.
  const operators = useMemo(() => {
    const byOp = new Map<string, Map<string, CompletedVehicle[]>>();
    for (const v of completedList) {
      const dates = byOp.get(v.operator) ?? new Map<string, CompletedVehicle[]>();
      const list = dates.get(v.workDate) ?? [];
      list.push(v);
      dates.set(v.workDate, list);
      byOp.set(v.operator, dates);
    }
    return [...byOp.entries()]
      .map(([op, dates]) => ({
        operator: op,
        dates: [...dates.entries()]
          .map(([d, vehicles]) => ({
            date: d,
            vehicles: [...vehicles].sort(
              (a, b) => a.route.localeCompare(b.route, "ko") || a.plate.localeCompare(b.plate),
            ),
          }))
          .sort((a, b) => b.date.localeCompare(a.date)), // 최근 설치일 먼저
      }))
      .sort((a, b) => (b.dates[0]?.date ?? "").localeCompare(a.dates[0]?.date ?? "")); // 최근 완료 운수사 먼저
  }, [completedList]);

  const selectedOp = operators.find((o) => o.operator === operator);
  const selectedDate = selectedOp?.dates.find((d) => d.date === date);
  const vehicles = selectedDate?.vehicles ?? [];

  // 운수사를 고르면 가장 최근 설치일로 자동 선택 → 차량 목록이 바로 뜬다
  function pickOperator(op: string) {
    setOperator(op);
    setDate(operators.find((o) => o.operator === op)?.dates[0]?.date ?? "");
    setState({});
  }

  function update(plate: string, patch: Partial<VocState>) {
    setState((s) => ({ ...s, [plate]: { ...(s[plate] ?? { voc: "", dayOff: false }), ...patch } }));
  }

  function close() {
    setOpen(false);
    setStep("form");
    setOperator("");
    setDate("");
    setState({});
    setNotes("");
    setBusy(false);
    setError(null);
  }

  const active = vehicles.filter((v) => !state[v.plate]?.dayOff);
  const dayOff = vehicles.filter((v) => state[v.plate]?.dayOff);
  const vocCount = active.filter((v) => state[v.plate]?.voc.trim()).length;

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/voc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operator,
          label: fmtLabel(date),
          items: active.map((v) => ({
            plate: v.plate,
            route: v.route,
            voc: state[v.plate]?.voc ?? "",
          })),
          dayOff: dayOff.map((v) => v.plate),
          notes,
        }),
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
        onClick={() => setOpen(true)}
        className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-purple-700"
      >
        📣 운수사 VOC
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
              <h2 className="text-sm font-bold text-purple-700">
                {step === "done" ? "전송 완료" : "📣 운수사 VOC"}
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
                  <p className="mt-2 text-sm font-semibold text-gray-700">팀즈로 전송했습니다</p>
                  <p className="mt-1 text-xs text-gray-400">설치 진행중 공유방으로 발송됨</p>
                  <button
                    type="button"
                    onClick={close}
                    className="mt-4 w-full rounded-xl bg-purple-600 py-3 text-sm font-bold text-white active:bg-purple-700"
                  >
                    확인
                  </button>
                </div>
              ) : operators.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  설치 완료된 운수사가 아직 없습니다.
                </p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] font-medium text-gray-500">
                      운수사 (최근 설치 완료순)
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {operators.map((o) => (
                        <button
                          key={o.operator}
                          type="button"
                          onClick={() => pickOperator(o.operator)}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                            operator === o.operator
                              ? "border-purple-600 bg-purple-600 text-white"
                              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {o.operator}
                          <span
                            className={`ml-1 font-normal ${
                              operator === o.operator ? "text-purple-200" : "text-gray-400"
                            }`}
                          >
                            {fmtLabel(o.dates[0]?.date ?? "")}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedOp && selectedOp.dates.length > 1 && (
                    <label className="block">
                      <span className="text-[11px] font-medium text-gray-500">설치일</span>
                      <select
                        value={date}
                        onChange={(e) => {
                          setDate(e.target.value);
                          setState({});
                        }}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-purple-500 focus:outline-none"
                      >
                        {selectedOp.dates.map((d) => (
                          <option key={d.date} value={d.date}>
                            {fmtLabel(d.date)} · {d.vehicles.length}대
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {!selectedOp ? (
                    <p className="py-8 text-center text-sm text-gray-400">
                      운수사를 선택하면 차량번호별 VOC 칸이 나옵니다.
                    </p>
                  ) : (
                    <>
                      <p className="rounded-lg bg-purple-50 px-3 py-2 text-center text-xs font-semibold text-purple-700">
                        {operator} · {fmtLabel(date)} 설치 {vehicles.length}대 · VOC {vocCount}건
                        {dayOff.length > 0 && ` · 휴차 ${dayOff.length}대`}
                      </p>

                      <div className="space-y-2">
                        {vehicles.map((v) => {
                          const s = state[v.plate] ?? { voc: "", dayOff: false };
                          return (
                            <div
                              key={v.plate}
                              className={`rounded-xl border p-2.5 ${
                                s.dayOff ? "border-gray-200 bg-gray-100" : "border-gray-200 bg-white"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-bold text-gray-800">
                                  {v.plate}
                                  {v.route && (
                                    <span className="ml-1 text-xs font-normal text-gray-400">
                                      {v.route}
                                    </span>
                                  )}
                                </p>
                                <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={s.dayOff}
                                    onChange={(e) => update(v.plate, { dayOff: e.target.checked })}
                                    className="h-4 w-4 accent-gray-500"
                                  />
                                  <span className="text-[11px] font-medium text-gray-500">
                                    금일 휴차
                                  </span>
                                </label>
                              </div>
                              {s.dayOff ? (
                                <p className="mt-1 text-[11px] text-gray-400">
                                  휴차 — 카드에서 제외됩니다
                                </p>
                              ) : (
                                <input
                                  type="text"
                                  value={s.voc}
                                  onChange={(e) => update(v.plate, { voc: e.target.value })}
                                  placeholder="VOC 내용 (없으면 비워두세요)"
                                  className="mt-1.5 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <label className="block">
                        <span className="text-[11px] font-medium text-gray-500">특이사항</span>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={2}
                          placeholder="차량과 무관한 전체 특이사항"
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </label>

                      {error && (
                        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                          {error}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={handleSend}
                        disabled={busy}
                        className="w-full rounded-xl bg-purple-600 py-3 text-sm font-bold text-white active:bg-purple-700 disabled:opacity-50"
                      >
                        {busy ? "전송 중..." : "팀즈로 보내기"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
