"use client";

import { useEffect, useState } from "react";
import type { OperatorSchedule } from "@/lib/stats";
import { workDateString } from "@/lib/work-day";

// 홈 화면 '배차표' 버튼 + 팝업 — 그날 설치할 운수사·노선을 골라 차량별
// 나가는 시간을 입력한다. 시간은 DB(dispatch_times)에 공용 저장되어
// 모든 기기에서 같은 배차표를 보고 수정할 수 있다(팀즈 전송 없음).

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0")); // 5분 단위

interface Entry {
  plate: string;
  route: string;
  outTime: string | null; // "HH:MM"
}

// "2026-07-15" → "2026.07.15"
function fmtDot(d: string): string {
  return d.replace(/-/g, ".");
}

// 나가는 시간순 정렬 — 미입력은 뒤, 같은 시간은 차량번호순
function sortEntries(list: Entry[]): Entry[] {
  return [...list].sort((a, b) => {
    const ka = a.outTime ?? "99:99";
    const kb = b.outTime ?? "99:99";
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.plate.localeCompare(b.plate, "ko");
  });
}

// 행 우측 시/분 드롭다운 (ConsultationModal TimeField의 축약형)
function RowTime({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [h, m] = value ? value.split(":") : ["", "00"];
  return (
    <div className="flex shrink-0 items-center gap-1">
      <select
        value={h}
        onChange={(e) => {
          const nh = e.target.value;
          onChange(nh ? `${nh}:${m || "00"}` : null);
        }}
        className="rounded-lg border border-gray-300 px-1.5 py-1.5 text-base focus:border-blue-500 focus:outline-none"
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
        disabled={!h}
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
        const ops = (j.operators ?? []).filter(
          (o: OperatorSchedule) => o.dates.length > 0,
        );
        setOperators(ops);
        setOptError(ops.length === 0);
      } catch {
        setOperators([]);
        setOptError(true);
      }
    })();
  }, [open, operators]);

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
  const timedCount = visible.filter((e) => e.outTime).length;

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
              {/* 운수사 */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  운수사
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
                        {visible.length}대 · 시간 입력 {timedCount}대 — 시간을
                        고르면 이른 순서로 정렬됩니다
                      </p>
                      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                        {visible.map((e) => (
                          <li
                            key={e.plate}
                            className="flex items-center justify-between gap-2 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-800">
                                {e.plate}
                              </p>
                              {!routeFilter && e.route && (
                                <p className="text-[11px] text-gray-400">{e.route}</p>
                              )}
                            </div>
                            <RowTime
                              value={e.outTime}
                              onChange={(v) => setTime(e.plate, v)}
                            />
                          </li>
                        ))}
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
