"use client";

import { useState } from "react";
import { downloadUrl } from "@/lib/download";

// 진행현황 양식(함수 보존) 다운로드 버튼 + 계획수량 입력 팝업.
// /api/export/progress 가 'attachment' 로 내려주므로 URL 직접 다운로드로 처리한다.
// (blob 방식은 아이폰 사파리에서 파일이 안 받아져 모바일 호환을 위해 사용하지 않는다.)
//
// 팝업에서 계획수량을 입력하면 진행현황 시트 A6(계획수량) 셀에 채워진 상태로 다운로드된다.
// 기본값(defaultPlan)은 설치일정상 '오늘까지' 누적 계획 대수이며, 일정이 바뀌면 자동 갱신된다.
// 필요하면 그 값을 수정해서 받을 수 있다.
export default function ProgressDownloadButton({ defaultPlan }: { defaultPlan: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(String(defaultPlan));

  function openModal() {
    setPlan(String(defaultPlan)); // 열 때마다 최신 기본값으로 초기화
    setOpen(true);
  }

  function close() {
    if (loading) return;
    setOpen(false);
  }

  function handleDownload() {
    setLoading(true);
    const trimmed = plan.trim();
    const url =
      trimmed !== "" && Number.isFinite(Number(trimmed)) && Number(trimmed) >= 0
        ? `/api/export/progress?plan=${encodeURIComponent(trimmed)}`
        : "/api/export/progress";
    downloadUrl(url);
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
              <h2 className="text-sm font-bold text-green-700">계획수량 입력</h2>
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
                진행현황 시트 <b>계획수량(A6)</b> 칸에 들어갈 값입니다. 오늘 날짜 기준
                설치일정상 계획수량이 자동으로 입력되어 있으며, 필요하면 수정할 수 있습니다.
              </p>

              <label className="mt-3 block">
                <span className="text-[11px] font-medium text-gray-500">계획수량 (대)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  autoFocus
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-base tabular-nums focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </label>

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
                  disabled={loading}
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
