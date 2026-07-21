"use client";

import { useMemo, useState } from "react";
import type { CompletedVehicle } from "@/lib/stats";
import StarRating from "./StarRating";
import {
  VOC_RATINGS,
  averageRating,
  cleanRatings,
  hasVocInput,
  type VocRatingKey,
  type VocRatings,
} from "@/lib/voc";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
function fmtLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
  return `${m}/${d} (${dow})`;
}

interface VocState {
  ratings: VocRatings; // 1~4번 항목 별점(5점 만점)
  comment: string; // 5번 기타 의견
  dayOff: boolean;
}

const EMPTY: VocState = { ratings: {}, comment: "", dayOff: false };

// 배차표의 '나가는 시간'이 붙은 완료 차량
type VocVehicle = CompletedVehicle & { outTime?: string | null };

// 'VOC 접수' 버튼 → 팝업. 최근 설치 완료된 운수사를 고르면 그 운수사·설치일의
// 차량번호가 자동으로 나열되고, 차량마다 4개 항목을 별점(5점)으로 매기고 기타 의견을
// 적는다. 저장하면 vocs 테이블에
// 운수사+설치일 기준으로 upsert되고, 같은 조합으로 다시 열면 불러와 수정할 수 있다.
// 버스가 나가는 텀에 맞춰 한 대씩 저장해도 되고, 팀즈 알림은 전체 차량이
// 입력(별점·의견 또는 휴차)됐을 때만 발송된다.
export default function VocModal() {
  const [open, setOpen] = useState(false);
  const [completedList, setCompletedList] = useState<VocVehicle[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [step, setStep] = useState<"form" | "done">("form");
  const [operator, setOperator] = useState("");
  const [date, setDate] = useState("");
  const [state, setState] = useState<Record<string, VocState>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneComplete, setDoneComplete] = useState(false); // 전체 입력 완료로 저장됐는지(팀즈 알림 발송 여부)
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false); // 저장된 VOC를 불러왔는지(= 수정 모드)

  // 운수사 → 완료 업무일 → 차량. completedList는 workDate 최신순으로 들어온다.
  const operators = useMemo(() => {
    const byOp = new Map<string, Map<string, VocVehicle[]>>();
    for (const v of completedList) {
      const dates = byOp.get(v.operator) ?? new Map<string, VocVehicle[]>();
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
            // 배차표(나가는 시간) 순 — 시간 미입력 차량은 뒤로, 그 안에서 노선·차량번호 순
            vehicles: [...vehicles].sort((a, b) => {
              const ta = a.outTime ?? "";
              const tb = b.outTime ?? "";
              if (ta && tb && ta !== tb) return ta.localeCompare(tb);
              if (ta && !tb) return -1;
              if (!ta && tb) return 1;
              return a.route.localeCompare(b.route, "ko") || a.plate.localeCompare(b.plate);
            }),
          }))
          .sort((a, b) => b.date.localeCompare(a.date)), // 최근 설치일 먼저
      }))
      .sort((a, b) => (b.dates[0]?.date ?? "").localeCompare(a.dates[0]?.date ?? "")); // 최근 완료 운수사 먼저
  }, [completedList]);

  const selectedOp = operators.find((o) => o.operator === operator);
  const selectedDate = selectedOp?.dates.find((d) => d.date === date);
  const vehicles = selectedDate?.vehicles ?? [];

  // 이미 저장된 VOC가 있으면 불러와 폼을 채운다 → 그대로 고쳐 다시 저장(수정)할 수 있다.
  async function loadExisting(op: string, d: string) {
    setState({});
    setNotes("");
    setLoaded(false);
    if (!op || !d) return;
    try {
      const res = await fetch(
        `/api/voc?operator=${encodeURIComponent(op)}&date=${encodeURIComponent(d)}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      const saved = json.voc;
      if (!saved) return;
      const next: Record<string, VocState> = {};
      for (const i of (saved.items ?? []) as {
        plate?: string;
        ratings?: unknown;
        comment?: string;
      }[]) {
        if (!i.plate) continue;
        next[i.plate] = {
          ratings: cleanRatings(i.ratings),
          comment: i.comment ?? "",
          dayOff: false,
        };
      }
      for (const plate of (saved.day_off ?? []) as string[]) {
        next[plate] = { ...(next[plate] ?? EMPTY), dayOff: true };
      }
      setState(next);
      setNotes(saved.notes ?? "");
      setLoaded(true);
    } catch {
      // 불러오기 실패해도 새로 입력하면 된다
    }
  }

  // 운수사를 고르면 가장 최근 설치일로 자동 선택 → 차량 목록이 바로 뜬다
  function pickOperator(op: string) {
    const d = operators.find((o) => o.operator === op)?.dates[0]?.date ?? "";
    setOperator(op);
    setDate(d);
    void loadExisting(op, d);
  }

  function update(plate: string, patch: Partial<VocState>) {
    setState((s) => ({ ...s, [plate]: { ...(s[plate] ?? EMPTY), ...patch } }));
  }

  function setStar(plate: string, key: VocRatingKey, v: number | undefined) {
    setState((s) => {
      const cur = s[plate] ?? EMPTY;
      const ratings = { ...cur.ratings };
      if (v === undefined) delete ratings[key];
      else ratings[key] = v;
      return { ...s, [plate]: { ...cur, ratings } };
    });
  }

  // 팝업을 열 때만 설치 완료 차량을 불러온다(홈 화면 초기 로딩과 분리).
  async function openModal() {
    setOpen(true);
    setListLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/voc/vehicles", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "차량 목록 조회 실패");
      setCompletedList((json.list ?? []) as VocVehicle[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "차량 목록 조회 실패");
    } finally {
      setListLoading(false);
    }
  }

  function close() {
    setOpen(false);
    setStep("form");
    setOperator("");
    setDate("");
    setState({});
    setNotes("");
    setBusy(false);
    setDoneComplete(false);
    setError(null);
    setLoaded(false);
    setCompletedList([]);
  }

  const active = vehicles.filter((v) => !state[v.plate]?.dayOff);
  const dayOff = vehicles.filter((v) => state[v.plate]?.dayOff);
  const vocCount = active.filter((v) => hasVocInput(state[v.plate] ?? EMPTY)).length;
  // 운수사 전체 평균 — 차량별 평균들의 평균
  const overallAvg = (() => {
    const avgs = active
      .map((v) => averageRating((state[v.plate] ?? EMPTY).ratings))
      .filter((a): a is number => a !== null);
    return avgs.length ? avgs.reduce((x, y) => x + y, 0) / avgs.length : null;
  })();

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/voc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operator,
          date,
          label: fmtLabel(date),
          items: active.map((v) => ({
            plate: v.plate,
            route: v.route,
            ratings: state[v.plate]?.ratings ?? {},
            comment: state[v.plate]?.comment ?? "",
          })),
          dayOff: dayOff.map((v) => v.plate),
          notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "저장 실패");
      setDoneComplete(Boolean(json.complete));
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="mt-2 rounded-xl border border-green-300 bg-white px-4 py-3 text-center text-sm font-semibold text-green-700 shadow-sm active:bg-green-50"
      >
        📣 VOC 접수
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
              <h2 className="text-sm font-bold text-green-700">
                {step === "done" ? "저장 완료" : "VOC 접수"}
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
                  <p className="text-3xl">{doneComplete ? "✅" : "💾"}</p>
                  <p className="mt-2 text-sm font-semibold text-gray-700">
                    {doneComplete ? "VOC를 저장했습니다" : "중간 저장했습니다"}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {doneComplete
                      ? "전체 차량 입력이 완료되어 팀즈 알림을 보냈습니다"
                      : `아직 입력 안 된 차량 ${active.length - vocCount}대 — 전체 입력 후 저장하면 팀즈 알림이 발송됩니다`}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    같은 운수사·설치일로 다시 열면 이어서 수정할 수 있습니다
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    className="mt-4 w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white active:bg-green-700"
                  >
                    확인
                  </button>
                </div>
              ) : listLoading ? (
                <p className="py-8 text-center text-sm text-gray-400">불러오는 중…</p>
              ) : operators.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  {error ?? "설치 완료된 운수사가 아직 없습니다."}
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
                              ? "border-green-600 bg-green-600 text-white"
                              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {o.operator}
                          <span
                            className={`ml-1 font-normal ${
                              operator === o.operator ? "text-green-200" : "text-gray-400"
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
                          void loadExisting(operator, e.target.value);
                        }}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-green-500 focus:outline-none"
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
                      운수사를 선택하면 차량번호별 별점 칸이 나옵니다.
                    </p>
                  ) : (
                    <>
                      <p className="rounded-lg bg-green-50 px-3 py-2 text-center text-xs font-semibold text-green-700">
                        {operator} · {fmtLabel(date)} 설치 {vehicles.length}대 · 평가 {vocCount}대{overallAvg !== null && ` · 평균 ★ ${overallAvg.toFixed(1)}`}
                        {dayOff.length > 0 && ` · 휴차 ${dayOff.length}대`}
                        {loaded && (
                          <span className="ml-1 font-normal text-green-600">
                            (저장된 내용 불러옴 — 수정 후 저장)
                          </span>
                        )}
                      </p>

                      <div className="space-y-2">
                        {vehicles.map((v) => {
                          const s = state[v.plate] ?? EMPTY;
                          const avg = averageRating(s.ratings);
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
                                  {v.outTime && (
                                    <span className="ml-1 text-xs font-normal text-blue-500">
                                      {v.outTime}
                                    </span>
                                  )}
                                  {avg !== null && !s.dayOff && (
                                    <span className="ml-1.5 text-xs font-semibold text-amber-500">
                                      ★ {avg.toFixed(1)}
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
                                  휴차 — 평가에서 제외됩니다
                                </p>
                              ) : (
                                <div className="mt-1.5 space-y-1">
                                  {VOC_RATINGS.map((r) => (
                                    <StarRating
                                      key={r.key}
                                      label={r.label}
                                      value={s.ratings[r.key]}
                                      onChange={(n) => setStar(v.plate, r.key, n)}
                                    />
                                  ))}
                                  <input
                                    type="text"
                                    value={s.comment}
                                    onChange={(e) => update(v.plate, { comment: e.target.value })}
                                    placeholder="기타 의견 (없으면 비워두세요)"
                                    className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                                  />
                                </div>
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
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
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
                        className="w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white active:bg-green-700 disabled:opacity-50"
                      >
                        {busy ? "저장 중..." : loaded ? "수정 저장" : "저장"}
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
