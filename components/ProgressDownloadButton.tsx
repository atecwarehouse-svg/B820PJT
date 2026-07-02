"use client";

import { useState } from "react";
import { downloadUrl } from "@/lib/download";

// 진행현황 양식(함수 보존) 다운로드 버튼 + 기준일 선택 팝업.
// /api/export/progress?date=YYYY-MM-DD 가 'attachment' 로 내려주므로 URL 직접 다운로드로 처리한다.
// (blob 방식은 아이폰 사파리에서 파일이 안 받아져 모바일 호환을 위해 사용하지 않는다.)
//
// 선택한 기준일 기준으로:
//  - 파일명(YYMMDD)·진행현황 기준일(A3·A10)이 그 날짜로 맞춰지고
//  - 누적 계획(F6)·금일 계획(A6)이 설치예정일 대수로 자동 채워지며
//  - 완료 실적은 그 날짜까지의 스냅샷으로 집계된다.
export interface SchedDay {
  date: string; // YYYY-MM-DD
  planned: number;
}

export default function ProgressDownloadButton({
  today,
  scheduleDays,
}: {
  today: string; // 현재 업무일 (YYYY-MM-DD)
  scheduleDays: SchedDay[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(today);

  // 미리보기용(서버가 동일 로직으로 다시 계산해 채운다)
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const cumPlan = scheduleDays.reduce((s, d) => (d.date <= date ? s + d.planned : s), 0);
  const dailyPlan = scheduleDays.find((d) => d.date === date)?.planned ?? 0;

  function openModal() {
    setDate(today); // 열 때마다 오늘로 초기화
    setOpen(true);
  }

  function close() {
    if (loading) return;
    setOpen(false);
  }

  function handleDownload() {
    if (!valid) return;
    setLoading(true);
    downloadUrl(`/api/export/progress?date=${encodeURIComponent(date)}`);
    // 다운로드는 브라우저 기본 동작으로 진행되어 완료 시점을 알 수 없으므로,
    // 잠깐 뒤 팝업을 닫고 버튼을 되돌린다.
    setTimeout(() => {
      setLoading(false);
      setOpen(false);
    }, 2500);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
      >
        진행현황 다운로드
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="mt-16 w-full max-w-xs rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-bold text-green-700">기준일 선택</h2>
              <button
                onClick={close}
                disabled={loading}
                className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              <p className="text-xs leading-relaxed text-gray-500">
                선택한 <b>기준일</b>까지의 설치 진행현황이 집계됩니다. 파일명과 진행현황 기준일,
                누적 계획수량이 이 날짜로 맞춰집니다.
              </p>

              <label className="mt-3 block">
                <span className="text-[11px] font-medium text-gray-500">기준일</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </label>

              <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                누적 계획 <b className="tabular-nums text-gray-800">{cumPlan}</b>대
                <span className="text-gray-400"> · 금일 계획 {dailyPlan}대</span>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={close}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={handleDownload}
                  disabled={loading || !valid}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? "준비 중…" : "다운로드"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
