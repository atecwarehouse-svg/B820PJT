"use client";

import { useEffect, useState } from "react";

// 홈 화면 새로고침 버튼 + 갱신시각.
// 홈 화면 앱(전체화면)에는 브라우저 새로고침이 없어 제공 — 페이지 전체를 다시 불러온다.
// 갱신시각 = 이 페이지를 불러온 시각(마운트 후 표시 — 서버 렌더 시각과의 불일치 방지).
export default function ReloadButton() {
  const [pending, setPending] = useState(false);
  const [loadedAt, setLoadedAt] = useState("");

  useEffect(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    setLoadedAt(`${p(d.getHours())}:${p(d.getMinutes())}`);
  }, []);

  return (
    <div className="flex flex-col items-center gap-1">
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
      {loadedAt && (
        <span className="text-[11px] text-gray-400">갱신시각 {loadedAt}</span>
      )}
    </div>
  );
}
