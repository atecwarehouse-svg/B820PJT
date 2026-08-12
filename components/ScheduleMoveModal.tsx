"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OperatorSchedule } from "@/lib/stats";

// 대시보드 '설치 일정' 옆 버튼 — 엑셀 재업로드 없이 선택한 차량의 설치 예정일만 옮긴다.
// 운수사·예정일로 차량을 불러와 체크한 뒤 새 날짜로 변경(관리자 비밀번호).

interface Vehicle {
  plate: string;
  route: string | null;
}

function fmtDot(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(m)}.${Number(day)}`;
}

export default function ScheduleMoveModal() {
  const [open, setOpen] = useState(false);
  const [operators, setOperators] = useState<OperatorSchedule[] | null>(null);
  const [operator, setOperator] = useState("");
  const [date, setDate] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [newDate, setNewDate] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ moved: number; date: string } | null>(null);
  const router = useRouter();

  const selectedOp = operators?.find((o) => o.operator === operator) ?? null;

  async function openModal() {
    setOpen(true);
    setDone(null);
    setError(null);
    if (operators !== null) return;
    try {
      const res = await fetch("/api/dispatch/options");
      const j = await res.json();
      setOperators(
        ((j.operators ?? []) as OperatorSchedule[]).filter((o) => o.dates.length > 0),
      );
    } catch {
      setError("설치 일정을 불러오지 못했습니다.");
      setOperators([]);
    }
  }

  function close() {
    setOpen(false);
    setOperator("");
    setDate("");
    setVehicles(null);
    setPicked(new Set());
    setNewDate("");
    setPw("");
    setError(null);
    setDone(null);
  }

  async function loadVehicles(op: string, d: string) {
    setVehicles(null);
    setPicked(new Set());
    setError(null);
    try {
      const res = await fetch(
        `/api/consultation/vehicles?operator=${encodeURIComponent(op)}&date=${encodeURIComponent(d)}`,
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "차량을 불러오지 못했습니다.");
      const list = (j.vehicles ?? []) as Vehicle[];
      setVehicles(list);
      setPicked(new Set(list.map((v) => v.plate))); // 기본 전체 선택 — 보통 그날 전체를 옮긴다
    } catch (e) {
      setVehicles([]);
      setError(e instanceof Error ? e.message : "차량을 불러오지 못했습니다.");
    }
  }

  function toggle(plate: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(plate)) next.delete(plate);
      else next.add(plate);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/schedule/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plates: [...picked], date: newDate, pw }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "변경 실패");
      setDone({ moved: j.moved, date: j.date });
      setOperators(null); // 다음에 열 때 날짜 목록 다시 로드
      router.refresh(); // 대시보드 일정·계획수량 갱신
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="shrink-0 rounded-lg border border-blue-300 bg-white px-3 py-1 text-xs font-semibold text-blue-600 shadow-sm transition-colors hover:bg-blue-50"
      >
        설치 일정변경
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="mt-12 w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-bold text-blue-700">설치 일정변경</h2>
              <button
                onClick={close}
                className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              {done ? (
                <div className="text-center">
                  <div className="text-3xl">✅</div>
                  <p className="mt-2 text-base font-bold text-gray-800">변경 완료</p>
                  <p className="mt-1 text-xs text-gray-500">
                    <b className="text-blue-700">{done.moved}대</b> → {fmtDot(done.date)} 설치 예정
                  </p>
                  <button
                    onClick={close}
                    className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    확인
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="rounded-lg bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-gray-600">
                    선택한 차량의 <b>설치 예정일만</b> 바꿉니다. 진행현황 다운로드에도 바로
                    반영되지만, PC의 원본 엑셀은 따로 고쳐두세요.
                    <br />
                    이미 입력한 배차표(시간·검수)는 원래 날짜에 그대로 남습니다.
                  </p>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">운수사</label>
                    {operators === null ? (
                      <p className="text-sm text-gray-400">불러오는 중…</p>
                    ) : (
                      <select
                        value={operator}
                        onChange={(e) => {
                          setOperator(e.target.value);
                          setDate("");
                          setVehicles(null);
                          setPicked(new Set());
                        }}
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

                  {selectedOp && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">
                        현재 설치 예정일
                      </label>
                      <select
                        value={date}
                        onChange={(e) => {
                          setDate(e.target.value);
                          if (e.target.value) loadVehicles(operator, e.target.value);
                        }}
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

                  {date && (
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-500">
                          옮길 차량{" "}
                          <b className="text-blue-700">{picked.size}</b>
                          <span className="text-gray-400">/{vehicles?.length ?? 0}대</span>
                        </label>
                        {vehicles && vehicles.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setPicked(
                                picked.size === vehicles.length
                                  ? new Set()
                                  : new Set(vehicles.map((v) => v.plate)),
                              )
                            }
                            className="text-xs font-medium text-blue-600 hover:underline"
                          >
                            {picked.size === vehicles.length ? "전체 해제" : "전체 선택"}
                          </button>
                        )}
                      </div>
                      {vehicles === null ? (
                        <p className="text-sm text-gray-400">불러오는 중…</p>
                      ) : vehicles.length === 0 ? (
                        <p className="rounded-lg bg-gray-50 py-3 text-center text-xs text-gray-400">
                          해당 날짜에 차량이 없습니다.
                        </p>
                      ) : (
                        <ul className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-50">
                          {vehicles.map((v) => (
                            <li key={v.plate}>
                              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 active:bg-blue-50">
                                <input
                                  type="checkbox"
                                  checked={picked.has(v.plate)}
                                  onChange={() => toggle(v.plate)}
                                  className="h-4 w-4"
                                />
                                <span className="text-sm font-medium text-gray-700">{v.plate}</span>
                                <span className="ml-auto text-xs text-gray-400">{v.route}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {picked.size > 0 && (
                    <>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">
                          변경할 설치 예정일
                        </label>
                        <input
                          type="date"
                          value={newDate}
                          onChange={(e) => setNewDate(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">
                          관리자 비밀번호
                        </label>
                        <input
                          type="password"
                          value={pw}
                          onChange={(e) => setPw(e.target.value)}
                          autoComplete="off"
                          placeholder="비밀번호 입력"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </>
                  )}

                  {error && <p className="text-xs text-red-500">{error}</p>}

                  <button
                    type="button"
                    onClick={submit}
                    disabled={busy || picked.size === 0 || !newDate || !pw || newDate === date}
                    className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy
                      ? "변경 중…"
                      : newDate && newDate !== date
                        ? `${picked.size}대 → ${fmtDot(newDate)}로 변경`
                        : "일정 변경"}
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
