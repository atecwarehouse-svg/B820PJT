"use client";

import { useEffect, useState } from "react";
import type { OperatorSchedule } from "@/lib/stats";
import { workDateString } from "@/lib/work-day";

// 홈 화면 '배차표' 버튼 + 팝업 — 그날 설치할 운수사·노선을 골라 차량별
// 나가는 시간을 입력한다. 시간은 DB(dispatch_times)에 공용 저장되어
// 모든 기기에서 같은 배차표를 보고 수정할 수 있다(팀즈 전송 없음).

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0")); // 5분 단위

// 휴차는 out_time에 "OFF"로 저장 — 별도 컬럼 없이 기존 테이블 그대로 사용
const OFF = "OFF";

interface Entry {
  plate: string;
  route: string;
  outTime: string | null; // "HH:MM" 또는 "OFF"(휴차)
  checklist: boolean; // 체크리스트 작성 완료
  completed: boolean; // 설치완료(서버 판정 — 저장+설치전후 사진 충족)
}

// "2026-07-15" → "2026.07.15"
function fmtDot(d: string): string {
  return d.replace(/-/g, ".");
}

// 나가는 시간순 정렬 — 미입력은 뒤, 휴차는 맨 뒤, 같은 시간은 차량번호순
function sortEntries(list: Entry[]): Entry[] {
  const key = (e: Entry) =>
    e.outTime === OFF ? "ZZ:ZZ" : e.outTime ?? "99:99";
  return [...list].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.plate.localeCompare(b.plate, "ko");
  });
}

// 행 우측 시/분 드롭다운 (ConsultationModal TimeField의 축약형)
function RowTime({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (v: string | null) => void;
}) {
  const [h, m] = value ? value.split(":") : ["", "00"];
  return (
    <div className="flex shrink-0 items-center gap-1">
      <select
        value={h}
        disabled={disabled}
        onChange={(e) => {
          const nh = e.target.value;
          onChange(nh ? `${nh}:${m || "00"}` : null);
        }}
        className="rounded-lg border border-gray-300 px-1.5 py-1.5 text-base focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
      >
        <option value="">--</option>
        {HOURS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span className="text-xs text-gray-500">시</span>
      <select
        value={h ? m : ""}
        disabled={disabled || !h}
        onChange={(e) => {
          if (h) onChange(`${h}:${e.target.value}`);
        }}
        className="rounded-lg border border-gray-300 px-1.5 py-1.5 text-base focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
      >
        {!h && <option value="">--</option>}
        {MINUTES.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span className="text-xs text-gray-500">분</span>
    </div>
  );
}

export default function DispatchButton() {
  const [open, setOpen] = useState(false);

  // 선택지(운수사·예정일·노선) — 모달 처음 열 때 1회 로드
  const [operators, setOperators] = useState<OperatorSchedule[] | null>(null);
  const [optError, setOptError] = useState(false);
  const [today] = useState(() => workDateString(new Date())); // 금일(업무일)

  const [operator, setOperator] = useState("");
  const [date, setDate] = useState("");
  const [routeFilter, setRouteFilter] = useState(""); // "" = 전체

  const [entries, setEntries] = useState<Entry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [dbReady, setDbReady] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open || operators !== null) return;
    (async () => {
      try {
        const res = await fetch("/api/dispatch/options");
        const j = await res.json();
        const ops: OperatorSchedule[] = (j.operators ?? []).filter(
          (o: OperatorSchedule) => o.dates.length > 0,
        );
        setOperators(ops);
        setOptError(ops.length === 0);
        // 금일 설치 일정이 있으면 첫 운수사를 자동 선택해 리스트까지 바로 표시
        const todayOp = ops.find((o) => o.dates.some((d) => d.date === today));
        if (todayOp) {
          setOperator(todayOp.operator);
          setDate(today);
          loadList(todayOp.operator, today);
        }
      } catch {
        setOperators([]);
        setOptError(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, operators]);

  // 금일 설치 운수사들(노선·대수 포함) — 팝업 상단에 자동 표시
  const todayOps = (operators ?? [])
    .map((o) => ({
      operator: o.operator,
      todayDate: o.dates.find((d) => d.date === today),
    }))
    .filter(
      (x): x is { operator: string; todayDate: OperatorSchedule["dates"][number] } =>
        !!x.todayDate,
    );

  // 금일 카드 탭 → 그 운수사의 오늘 배차표로 바로 이동
  function selectToday(op: string) {
    if (operator === op && date === today) return;
    setOperator(op);
    setDate(today);
    setRouteFilter("");
    setSaveMsg(null);
    loadList(op, today);
  }

  const selectedOp = operators?.find((o) => o.operator === operator) ?? null;
  const selectedDate = selectedOp?.dates.find((d) => d.date === date) ?? null;

  function selectOperator(name: string) {
    setOperator(name);
    setRouteFilter("");
    setEntries([]);
    setSaveMsg(null);
    const op = operators?.find((o) => o.operator === name);
    if (!op) {
      setDate("");
      return;
    }
    // 예정일이 1개면 자동 선택, 오늘(업무일)이 목록에 있으면 오늘 우선
    const today = workDateString(new Date());
    const pick =
      op.dates.find((d) => d.date === today)?.date ??
      (op.dates.length === 1 ? op.dates[0].date : "");
    setDate(pick);
    if (pick) loadList(name, pick);
  }

  function selectDate(d: string) {
    setDate(d);
    setRouteFilter("");
    setEntries([]);
    setSaveMsg(null);
    if (d) loadList(operator, d);
  }

  async function loadList(op: string, d: string) {
    setListLoading(true);
    setListError("");
    try {
      const res = await fetch(
        `/api/dispatch?operator=${encodeURIComponent(op)}&date=${encodeURIComponent(d)}`,
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "차량 목록을 불러오지 못했습니다.");
      setEntries(j.vehicles ?? []);
      setDbReady(j.dbReady !== false);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "차량 목록을 불러오지 못했습니다.");
      setEntries([]);
    } finally {
      setListLoading(false);
    }
  }

  function setTime(plate: string, v: string | null) {
    setEntries((list) =>
      list.map((e) => (e.plate === plate ? { ...e, outTime: v } : e)),
    );
    setSaveMsg(null);
  }

  // 휴차 토글 — 체크하면 시간은 지워지고 맨 뒤로 정렬
  function toggleOff(plate: string, checked: boolean) {
    setTime(plate, checked ? OFF : null);
  }

  // 체크리스트 작성 토글
  function toggleChecklist(plate: string, checked: boolean) {
    setEntries((list) =>
      list.map((e) => (e.plate === plate ? { ...e, checklist: checked } : e)),
    );
    setSaveMsg(null);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operator, date, entries }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "저장에 실패했습니다.");
      setSaveMsg({ ok: true, text: "저장됨 ✓ 모든 기기에서 같은 배차표가 보입니다." });
    } catch (e) {
      setSaveMsg({
        ok: false,
        text: e instanceof Error ? e.message : "저장에 실패했습니다.",
      });
    } finally {
      setSaving(false);
    }
  }

  // 표시 목록 — 노선 필터 적용 후 시간순 정렬 (저장은 항상 entries 전체)
  const visible = sortEntries(
    routeFilter ? entries.filter((e) => e.route === routeFilter) : entries,
  );
  const timedCount = visible.filter((e) => e.outTime && e.outTime !== OFF).length;
  const offCount = visible.filter((e) => e.outTime === OFF).length;
  const checkCount = visible.filter((e) => e.checklist).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-semibold text-blue-700 shadow-sm active:bg-blue-100"
      >
        🚌 배차표
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="mb-12 mt-8 w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between rounded-t-2xl bg-blue-600 px-4 py-3 text-white">
              <div>
                <p className="text-sm font-bold">🚌 배차표</p>
                <p className="text-xs text-blue-200">
                  차량별 나가는 시간 — 시간순 자동 정렬
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-0.5 text-lg leading-none text-blue-100 active:bg-blue-700"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              {/* 금일 설치 — 오늘 일정이 있는 운수사·노선 자동 표시 */}
              {operators !== null && !optError && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    금일 설치 ({fmtDot(today)})
                  </label>
                  {todayOps.length === 0 ? (
                    <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400">
                      금일 설치 일정이 없습니다. 아래에서 직접 선택하세요.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {todayOps.map((t) => {
                        const active = operator === t.operator && date === today;
                        return (
                          <button
                            key={t.operator}
                            type="button"
                            onClick={() => selectToday(t.operator)}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left ${
                              active
                                ? "border-blue-500 bg-blue-50"
                                : "border-gray-200 bg-white active:bg-gray-50"
                            }`}
                          >
                            <span
                              className={`text-sm font-semibold ${
                                active ? "text-blue-700" : "text-gray-800"
                              }`}
                            >
                              {t.operator}
                            </span>
                            <span className="shrink-0 text-[11px] text-gray-500">
                              {t.todayDate.routes
                                .map((r) => `${r.route} ${r.count}대`)
                                .join(" · ")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 운수사 직접 선택 */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  운수사 직접 선택
                </label>
                {operators === null ? (
                  <p className="text-sm text-gray-400">불러오는 중…</p>
                ) : optError ? (
                  <p className="text-sm text-red-500">
                    설치 일정을 불러오지 못했습니다. 잠시 후 다시 열어주세요.
                  </p>
                ) : (
                  <select
                    value={operator}
                    onChange={(e) => selectOperator(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">운수사 선택</option>
                    {operators.map((o) => (
                      <option key={o.operator} value={o.operator}>
                        {o.operator}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* 설치 예정일 */}
              {selectedOp && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    설치 예정일
                  </label>
                  <select
                    value={date}
                    onChange={(e) => selectDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">날짜 선택</option>
                    {selectedOp.dates.map((d) => (
                      <option key={d.date} value={d.date}>
                        {fmtDot(d.date)} ({d.count}대)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 노선 */}
              {selectedDate && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    노선
                  </label>
                  <select
                    value={routeFilter}
                    onChange={(e) => setRouteFilter(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">전체 ({selectedDate.count}대)</option>
                    {selectedDate.routes.map((r) => (
                      <option key={r.route} value={r.route}>
                        {r.route} ({r.count}대)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 차량 리스트 */}
              {date && (
                <div>
                  {listLoading ? (
                    <p className="py-4 text-center text-sm text-gray-400">
                      차량 목록 불러오는 중…
                    </p>
                  ) : listError ? (
                    <p className="py-2 text-sm text-red-500">{listError}</p>
                  ) : visible.length === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-400">
                      해당 날짜의 차량이 없습니다.
                    </p>
                  ) : (
                    <>
                      {!dbReady && (
                        <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                          시간을 저장하려면 DB 준비(migration_dispatch.sql 실행)가
                          필요합니다. 관리자에게 문의하세요.
                        </div>
                      )}
                      <p className="mb-1 text-[11px] text-gray-400">
                        {visible.length}대 · 시간 입력 {timedCount}대
                        {checkCount > 0 && ` · 검수완료 ${checkCount}대`}
                        {offCount > 0 && ` · 휴차 ${offCount}대`} — 시간을 고르면
                        이른 순서로 정렬됩니다
                      </p>
                      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                        {visible.map((e) => {
                          const isOff = e.outTime === OFF;
                          return (
                            <li
                              key={e.plate}
                              className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-2 ${
                                isOff ? "bg-red-50/60" : ""
                              }`}
                            >
                              <div className="min-w-0">
                                <p
                                  className={`truncate text-sm font-medium ${
                                    isOff
                                      ? "text-red-400 line-through"
                                      : "text-gray-800"
                                  }`}
                                >
                                  {e.plate}
                                  {e.completed && (
                                    <span className="ml-1.5 rounded bg-green-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-green-700">
                                      설치완료
                                    </span>
                                  )}
                                </p>
                                {!routeFilter && e.route && (
                                  <p className="text-[11px] text-gray-400">
                                    {e.route}
                                  </p>
                                )}
                              </div>
                              <div className="ml-auto flex shrink-0 items-center gap-2">
                                <label className="flex cursor-pointer items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={e.checklist}
                                    onChange={(ev) =>
                                      toggleChecklist(e.plate, ev.target.checked)
                                    }
                                    className="h-4 w-4 accent-green-600"
                                  />
                                  <span
                                    className={`text-xs ${
                                      e.checklist
                                        ? "font-semibold text-green-700"
                                        : "text-gray-500"
                                    }`}
                                  >
                                    검수완료
                                  </span>
                                </label>
                                <label className="flex cursor-pointer items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={isOff}
                                    onChange={(ev) =>
                                      toggleOff(e.plate, ev.target.checked)
                                    }
                                    className="h-4 w-4 accent-red-600"
                                  />
                                  <span
                                    className={`text-xs ${
                                      isOff
                                        ? "font-semibold text-red-600"
                                        : "text-gray-500"
                                    }`}
                                  >
                                    휴차
                                  </span>
                                </label>
                                <RowTime
                                  value={isOff ? null : e.outTime}
                                  disabled={isOff}
                                  onChange={(v) => setTime(e.plate, v)}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              )}

              {/* 저장 */}
              {date && !listLoading && entries.length > 0 && (
                <div>
                  <button
                    onClick={handleSave}
                    disabled={saving || !dbReady}
                    className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "저장 중…" : "💾 저장"}
                  </button>
                  {saveMsg && (
                    <p
                      className={`mt-1.5 text-center text-xs ${
                        saveMsg.ok ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {saveMsg.text}
                    </p>
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
