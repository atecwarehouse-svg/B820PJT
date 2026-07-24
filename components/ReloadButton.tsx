"use client";

import { useState } from "react";

// 홈 화면 새로고침 버튼.
// 홈 화면 앱(전체화면)에는 브라우저 새로고침이 없어 제공 — 페이지 전체를 다시 불러온다.
export default function ReloadButton() {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        setPending(true);
        window.location.reload();
      }}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors active:bg-blue-700 disabled:opacity-50"
    >
      <span className={pending ? "inline-block animate-spin" : "inline-block"}>↻</span>
      {pending ? "새로고침 중…" : "새로고침"}
    </button>
  );
}
