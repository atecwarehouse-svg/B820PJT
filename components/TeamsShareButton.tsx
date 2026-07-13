"use client";

import { useState } from "react";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
function fmtLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
  return `${m}/${d} (${dow})`;
}

// '설치진행중 공유' / '설치시작 보고' 버튼 → 카드 팝업 → 팀즈 채널(같은 공유방)로 전송.
// kind="start" 는 금일 작업 시작 보고 카드(진행중 항목 없음)를 보낸다.
export default function TeamsShareButton({
  kind = "progress",
  today,
  todayPlanned,
  todayDone = 0,
  complete,
  inProgress,
  remain,
  planGroups = [],
}: {
  kind?: "progress" | "start";
  today: string;
  todayPlanned: number;
  todayDone?: number; // 금일 완료 (진행 현황 카드용, 저장 + 설치 전·후 사진 전부 충족)
  complete: number;
  inProgress: number;
  remain: number;
  // 설치 시작 보고용 — 금일 계획의 운수사·노선별 대수
  planGroups?: { operator: string; route: string; planned: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const label = fmtLabel(today);
  const isStart = kind === "start";

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

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMsg(null);
          setOpen(true);
        }}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors ${
          isStart ? "bg-orange-600 hover:bg-orange-700" : "bg-indigo-600 hover:bg-indigo-700"
        }`}
      >
        {isStart ? "설치시작 보고" : "설치진행중 공유"}
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
            <div
              className={`rounded-t-2xl px-4 py-3 text-white ${isStart ? "bg-orange-600" : "bg-indigo-600"}`}
            >
              <p className="text-sm font-bold">
                {isStart ? "B820 단말기 설치 시작 보고" : "🚌 B820 단말기 설치 진행 현황"}
              </p>
              <p className={`text-xs ${isStart ? "text-orange-200" : "text-indigo-200"}`}>
                {isStart ? `${label} 설치 시작` : `${label} 기준`}
              </p>
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
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  isStart ? "bg-orange-600 hover:bg-orange-700" : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {sharing ? "전송 중…" : isStart ? "팀즈로 보고" : "팀즈로 공유"}
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
