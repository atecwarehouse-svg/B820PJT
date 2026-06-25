"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshDashboard } from "@/app/dashboard/actions";

// 대시보드 새로고침 버튼.
// 홈 화면 앱(전체화면)에는 브라우저 새로고침이 없어, 입력 반영 여부를 확인할 수 있게 제공.
// 캐시 무효화(서버 액션) → 라우터 새로고침 순으로 항상 최신 데이터를 다시 불러온다.
export default function RefreshButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleRefresh() {
    startTransition(async () => {
      await refreshDashboard();
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors active:bg-blue-700 disabled:opacity-50"
    >
      <span className={pending ? "inline-block animate-spin" : "inline-block"}>↻</span>
      {pending ? "새로고침 중…" : "새로고침"}
    </button>
  );
}
