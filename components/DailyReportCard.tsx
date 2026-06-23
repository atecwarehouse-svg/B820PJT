"use client";

import { useMemo, useState } from "react";
import type { CompletedVehicle, ScheduleDay } from "@/lib/stats";
import { buildReport, formatReportText } from "@/lib/report";

// 금일 설치 완료 리포트 카드 — 미리보기 + Gmail 발송.
export default function DailyReportCard({
  completedList,
  scheduleDays,
  cumDone,
  cumPlanned,
  today,
}: {
  completedList: CompletedVehicle[];
  scheduleDays: ScheduleDay[];
  cumDone: number;
  cumPlanned: number;
  today: string;
}) {
  const [date, setDate] = useState(today);
  const [planned, setPlanned] = useState(""); // 금일 계획 수량 직접 입력
  const [notes, setNotes] = useState("");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 입력값(숫자) 있으면 override, 없으면 null → 예정일 기준 자동 계산
  const plannedOverride =
    planned.trim() !== "" && !isNaN(Number(planned)) ? Number(planned) : null;

  const report = useMemo(
    () => buildReport({ date, completedList, scheduleDays, cumDone, cumPlanned, plannedOverride }),
    [date, completedList, scheduleDays, cumDone, cumPlanned, plannedOverride],
  );
  const text = useMemo(() => formatReportText(report, notes), [report, notes]);

  async function send() {
    setSending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/report/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, notes, to, planned: plannedOverride }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "발송 실패");
      setMsg({ ok: true, text: `발송 완료 → ${(j.to ?? []).join(", ")}` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "발송 실패" });
    } finally {
      setSending(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ ok: true, text: "복사되었습니다." });
    } catch {
      setMsg({ ok: false, text: "복사 실패" });
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setDate(today)}
          className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
        >
          오늘
        </button>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">계획</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
            placeholder="수량"
            className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
          <span className="text-xs text-gray-500">대</span>
        </div>
      </div>

      {/* 카드 미리보기 */}
      <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-gray-200 bg-gray-50 p-3 text-[13px] leading-relaxed text-gray-800">
        {text}
      </pre>

      {/* 특이사항 */}
      <label className="mt-3 block text-xs font-medium text-gray-600">특이사항 (선택)</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder={"예) 영신여객 5대 배차시간 부족으로 미설치, 금일 설치예정"}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />

      {/* 받는사람 */}
      <label className="mt-2 block text-xs font-medium text-gray-600">받는사람 (쉼표로 여러 명, 비우면 기본값)</label>
      <input
        type="text"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="name@example.com, name2@example.com"
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />

      <div className="mt-3 flex gap-2">
        <button
          onClick={copy}
          className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          복사
        </button>
        <button
          onClick={send}
          disabled={sending}
          className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {sending ? "발송 중…" : "메일 발송"}
        </button>
      </div>
      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      )}
    </div>
  );
}
