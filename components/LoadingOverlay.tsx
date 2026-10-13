"use client";

// 전체화면 로딩 오버레이 — 프로젝트 생성·삭제·저장, 페이지 이동(NavLoading)에서 같이 쓴다.
// 돌아가는 링 + 한 줄 설명. 뒤 화면은 흐리게 가려 두 번 누르는 걸 막는다.
export default function LoadingOverlay({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-white/70 backdrop-blur-[2px] motion-safe:animate-fade-in" role="status" aria-live="polite">
      <div className="flex flex-col items-center rounded-3xl bg-white px-8 py-6 shadow-xl ring-1 ring-black/5 motion-safe:animate-rise">
        <span className="relative flex h-12 w-12 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-4 border-blue-100" />
          <span className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent motion-safe:animate-spin" />
        </span>
        <p className="mt-3 text-sm font-semibold text-gray-800">{label}</p>
        {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}
