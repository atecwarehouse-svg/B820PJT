"use client";

import { useEffect, useState } from "react";

// 새 프로젝트에서 차량 리스트가 아직 없을 때(최초 업로드 전) 대시보드에 들어오면 한 번 띄우는 안내 팝업.
// '지금 업로드'는 ScheduleUploadModal이 듣는 open-schedule-upload 이벤트를 쏴서 업로드 팝업을 바로 연다.
// 같은 브라우저 세션에서는 한 번만(sessionStorage) — 업로드가 끝나 차량이 생기면 아예 안 뜬다.
export const OPEN_UPLOAD_EVENT = "open-schedule-upload";
const KEY = "initUploadPrompt";

export default function InitialUploadPrompt({ show }: { show: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!show) return;
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
    } catch {
      // 저장소 못 쓰면 매번 띄움
    }
    setOpen(true);
  }, [show]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-5 text-center shadow-xl motion-safe:animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-3xl">📂</span>
        <h2 className="mt-3 text-base font-bold text-gray-900">현황 파일을 업로드해 주세요</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          아직 차량 리스트가 없습니다. 전개현황 엑셀(로우데이터)을 올리면 차량 리스트와 설치 일정이 등록되고 진행
          현황이 집계됩니다.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl bg-white px-4 py-2.5 text-sm text-gray-600 shadow-sm ring-1 ring-black/5 active:bg-gray-100"
          >
            나중에
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new CustomEvent(OPEN_UPLOAD_EVENT));
            }}
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm active:bg-blue-700"
          >
            지금 업로드
          </button>
        </div>
      </div>
    </div>
  );
}
