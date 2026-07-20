"use client";

import { useState } from "react";
import type { CompletedVehicle, ScheduleDay } from "@/lib/stats";
import DailyReportCard from "@/components/DailyReportCard";

// '금일 완료 리포트' 버튼 → 팝업(모달)로 카드 표시, 발송 완료 시 확인 팝업.
export default function DailyReportModal(props: {
  completedList: CompletedVehicle[];
  scheduleDays: ScheduleDay[];
  cumDone: number;
  cumPlanned: number;
  today: string;
  inProgress?: number;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<1 | 2>(1);
  const [sentTo, setSentTo] = useState<string[] | null>(null); // 발송 완료 팝업
  const [sentStage, setSentStage] = useState<1 | 2>(1);
  const [teamsSent, setTeamsSent] = useState(false); // 팀즈 완료보고 카드 전송 여부

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
      >
        금일 완료 리포트
      </button>

      {/* 리포트 모달 */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-8 w-full max-w-lg rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-bold text-blue-700">금일 완료 리포트</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              {/* 1차 = 팀즈 알림만 · 2차 = VOC 포함 + 메일 발송 */}
              <div className="mb-3 flex gap-1">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStage(n)}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                      stage === n
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-gray-100 text-gray-600 active:bg-gray-200"
                    }`}
                  >
                    {n === 1 ? "1차 (팀즈 알림)" : "2차 (VOC + 메일)"}
                  </button>
                ))}
              </div>
              <DailyReportCard
                {...props}
                key={stage}
                stage={stage}
                onSent={(to, teams) => {
                  setSentTo(to);
                  setSentStage(stage);
                  setTeamsSent(teams === true);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 발송 완료 팝업 */}
      {sentTo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl">
            <div className="text-3xl">✅</div>
            <p className="mt-2 text-base font-bold text-gray-800">
              {sentStage === 1 ? "1차 전송 완료" : "2차 발송 완료"}
            </p>
            {sentStage === 2 && (
              <p className="mt-1 break-words text-xs text-gray-500">
                {sentTo.length > 0 ? sentTo.join(", ") : "기본 수신자"}
              </p>
            )}
            <p className={`mt-2 text-xs font-medium ${teamsSent ? "text-green-600" : "text-amber-600"}`}>
              {sentStage === 1
                ? "팀즈 '설치 진행중' 공유방으로 완료보고 카드를 보냈습니다. (메일 미발송)"
                : teamsSent
                  ? "메일과 함께 팀즈 공유방에도 VOC 포함 완료보고 카드를 보냈습니다."
                  : "⚠️ 팀즈 완료보고 카드 전송에 실패했습니다. (메일은 발송됨)"}
            </p>
            <button
              onClick={() => {
                setSentTo(null);
                setOpen(false); // 폼 닫아 재발송 방지
              }}
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
}
