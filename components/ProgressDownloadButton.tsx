"use client";

import { useState } from "react";
import { downloadUrl } from "@/lib/download";

// 진행현황 양식(함수 보존) 다운로드 버튼.
// /api/export/progress 가 'attachment' 로 내려주므로 URL 직접 다운로드로 처리한다.
// (blob 방식은 아이폰 사파리에서 파일이 안 받아져 모바일 호환을 위해 사용하지 않는다.)
export default function ProgressDownloadButton() {
  const [loading, setLoading] = useState(false);

  function handleDownload() {
    setLoading(true);
    downloadUrl("/api/export/progress");
    // 다운로드는 브라우저 기본 동작으로 진행되어 완료 시점을 알 수 없으므로,
    // 중복 클릭만 잠깐 막은 뒤 버튼을 되돌린다.
    setTimeout(() => setLoading(false), 4000);
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? "다운로드 준비 중…" : "진행현황 다운로드"}
      </button>
    </div>
  );
}
