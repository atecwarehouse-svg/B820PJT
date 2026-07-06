"use client";

import { useEffect, useRef, useState } from "react";
import type { Vehicle } from "@/lib/types";

const REASONS = ["자재 부족", "단말기 불량", "차량 문제", "기술 문의", "기타"] as const;
const COOLDOWN_MS = 5 * 60 * 1000; // 같은 차량 재호출 경고 기준(5분)
const TEAM_KEY = "adminCall:team";
const COOLDOWN_KEY = "adminCall:cooldowns";

// localStorage에서 차량별 마지막 호출 시각 맵을 읽기 (오래된 항목은 정리)
function readCooldowns(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    for (const k of Object.keys(map)) {
      if (now - map[k] >= COOLDOWN_MS) delete map[k];
    }
    return map;
  } catch {
    return {};
  }
}

// 홈 화면 '관리자 호출' 버튼 → 팀명/차량/사유/메모 입력 → 팀즈 카드 전송.
export default function AdminCallButton() {
  const [open, setOpen] = useState(false);

  const [team, setTeam] = useState("");
  const [teamTouched, setTeamTouched] = useState(false);

  // 차량 자동완성 (PlateSearch 패턴 차용 — 선택 시 이동 대신 확정)
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Vehicle[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [reason, setReason] = useState<string | null>(null);
  const [memo, setMemo] = useState("");

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownWarn, setCooldownWarn] = useState<string | null>(null); // 재호출 경고 문구

  useEffect(() => {
    if (!open) return;
    try {
      setTeam(localStorage.getItem(TEAM_KEY) ?? "");
    } catch {
      // localStorage 사용 불가 환경 무시
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = q.trim();
    if (selected || query.length < 1) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/vehicles/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        if (res.ok) setResults(json.results ?? []);
      } catch {
        // 검색 실패는 조용히 무시 (재입력 시 재시도)
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, selected]);

  function openModal() {
    setOpen(true);
    setSent(false);
    setError(null);
    setCooldownWarn(null);
  }

  function resetForm() {
    setQ("");
    setResults([]);
    setSelected(null);
    setReason(null);
    setMemo("");
    setCooldownWarn(null);
  }

  async function send(force: boolean) {
    if (sending) return;
    setTeamTouched(true);
    setError(null);
    if (!team.trim() || !selected || !reason) {
      if (!selected) setError("차량번호를 목록에서 선택하세요.");
      else if (!reason) setError("호출 사유를 선택하세요.");
      return;
    }

    // 중복 호출 방지: 같은 차량 5분 내 재호출이면 경고 후 [그래도 보내기]로만 전송
    if (!force) {
      const last = readCooldowns()[selected.plate];
      if (last) {
        const min = Math.max(1, Math.ceil((Date.now() - last) / 60000));
        setCooldownWarn(
          `⚠️ 약 ${min}분 전에 이 차량으로 이미 호출했습니다. 그래도 다시 보내시겠어요?`,
        );
        return;
      }
    }
    setCooldownWarn(null);

    setSending(true);
    try {
      const res = await fetch("/api/admin-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team: team.trim(),
          plate: selected.plate,
          reason,
          memo: memo.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "전송 실패");
      try {
        localStorage.setItem(TEAM_KEY, team.trim());
        const map = readCooldowns();
        map[selected.plate] = Date.now();
        localStorage.setItem(COOLDOWN_KEY, JSON.stringify(map));
      } catch {
        // localStorage 실패해도 전송은 성공
      }
      setSent(true);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setSending(false);
    }
  }

  const teamInvalid = teamTouched && !team.trim();

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-700 shadow-sm active:bg-red-100"
      >
        🚨 관리자 호출
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-8 w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-t-2xl bg-red-600 px-4 py-3 text-white">
              <p className="text-sm font-bold">🚨 관리자 호출</p>
              <p className="text-xs text-red-200">팀즈로 관리자에게 알림이 전송됩니다</p>
            </div>

            {sent ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm font-semibold text-green-600">
                  ✅ 관리자에게 호출을 보냈습니다.
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-4 w-full rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 active:bg-gray-200"
                >
                  닫기
                </button>
              </div>
            ) : (
              <div className="space-y-3 px-4 py-4">
                {/* 팀명 */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    팀명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                    onBlur={() => setTeamTouched(true)}
                    placeholder="팀명작성"
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                      teamInvalid
                        ? "border-red-300 bg-red-50"
                        : "border-gray-300 focus:border-red-500"
                    }`}
                  />
                  {teamInvalid && (
                    <p className="mt-1 text-xs text-red-500">팀명을 입력하세요</p>
                  )}
                </div>

                {/* 차량번호 */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    차량번호 <span className="text-red-500">*</span>
                  </label>
                  {selected ? (
                    <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <div>
                        <span className="text-sm font-semibold">{selected.plate}</span>
                        <span className="ml-2 text-xs text-gray-500">
                          {selected.operator} · {selected.route}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setSelected(null);
                          setQ("");
                        }}
                        className="ml-2 rounded px-1.5 text-sm text-gray-400 active:bg-red-100"
                        aria-label="차량 다시 선택"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="차량번호 검색 (예: 4005)"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
                      />
                      {searching && <p className="mt-1 text-xs text-gray-400">검색 중…</p>}
                      {results.length > 0 && (
                        <ul className="mt-1 max-h-44 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                          {results.map((v) => (
                            <li key={v.plate}>
                              <button
                                onClick={() => {
                                  setSelected(v);
                                  setResults([]);
                                }}
                                className="flex w-full items-center justify-between px-3 py-2 text-left active:bg-red-50"
                              >
                                <span className="text-sm font-medium">{v.plate}</span>
                                <span className="text-xs text-gray-500">
                                  {v.operator} · {v.route}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {!searching && q.trim().length >= 1 && results.length === 0 && (
                        <p className="mt-1 text-xs text-gray-400">일치하는 차량이 없습니다.</p>
                      )}
                    </>
                  )}
                </div>

                {/* 호출 사유 */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    호출 사유 <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {REASONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setReason(r)}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                          r === "기타" ? "col-span-2" : ""
                        } ${
                          reason === r
                            ? "border-red-600 bg-red-600 text-white"
                            : "border-gray-300 bg-white text-gray-700 active:bg-red-50"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 메모 */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">메모</label>
                  <textarea
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    rows={2}
                    maxLength={300}
                    placeholder="추가 설명 (선택)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
                  />
                </div>

                {error && <p className="text-xs text-red-500">{error}</p>}

                {cooldownWarn ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                    <p className="text-xs text-amber-700">{cooldownWarn}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setCooldownWarn(null)}
                        disabled={sending}
                        className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 active:bg-gray-200 disabled:opacity-50"
                      >
                        취소
                      </button>
                      <button
                        onClick={() => send(true)}
                        disabled={sending}
                        className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white active:bg-amber-600 disabled:opacity-50"
                      >
                        {sending ? "전송 중…" : "그래도 보내기"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setOpen(false)}
                      disabled={sending}
                      className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 active:bg-gray-200 disabled:opacity-50"
                    >
                      닫기
                    </button>
                    <button
                      onClick={() => send(false)}
                      disabled={sending}
                      className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white active:bg-red-700 disabled:opacity-50"
                    >
                      {sending ? "전송 중…" : "🚨 관리자 호출하기"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
