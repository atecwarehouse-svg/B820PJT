"use client";

import { useState } from "react";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
function fmtLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
  return `${m}/${d} (${dow})`;
}

// '설치진행중 공유' 버튼 → 카드 팝업 → 팀즈 채널로 전송.
export default function TeamsShareButton({
  today,
  todayPlanned,
  complete,
  inProgress,
  remain,
}: {
  today: string;
  todayPlanned: number;
  complete: number;
  inProgress: number;
  remain: number;
}) {
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const label = fmtLabel(today);

  async function share() {
    if (sharing) return;
    setSharing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/teams/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, todayPlanned, complete, inProgress, remain }),
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

  const rows: [string, number, string][] = [
    ["금일 설치계획", todayPlanned, "text-gray-700"],
    ["진행중", inProgress, "text-amber-600"],
    ["완료", complete, "text-green-700"],
    ["잔여(설치대상)", remain, "text-gray-600"],
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMsg(null);
          setOpen(true);
        }}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
      >
        설치진행중 공유
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-10 w-full max-w-xs rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 카드 미리보기 */}
            <div className="rounded-t-2xl bg-indigo-600 px-4 py-3 text-white">
              <p className="text-sm font-bold">🚌 B820 단말기 설치 진행 현황</p>
              <p className="text-xs text-indigo-200">{label} 기준</p>
            </div>
            <div className="px-4 py-3">
              <ul className="divide-y divide-gray-100">
                {rows.map(([k, v, color]) => (
                  <li key={k} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-gray-500">{k}</span>
                    <span className={`tabular-nums font-bold ${color}`}>{v.toLocaleString()}대</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2 border-t border-gray-100 px-4 py-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
              >
                닫기
              </button>
              <button
                onClick={share}
                disabled={sharing}
                className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {sharing ? "전송 중…" : "팀즈로 공유"}
              </button>
            </div>
            {msg && (
              <p className={`px-4 pb-3 text-xs ${msg.ok ? "text-green-600" : "text-red-500"}`}>
                {msg.text}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
