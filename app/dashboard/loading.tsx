// 대시보드 로딩 화면 — 서버가 집계(여러 쿼리, 수 초)를 끝내기 전에 먼저 그려진다 (Next.js 라우트 loading).
// 실제 화면과 같은 자리(머리 · KPI 3칸 · 큰 카드 2개 · 버튼 줄)를 뼈대로 깔아 체감 대기를 줄인다.
export default function DashboardLoading() {
  const box = "animate-pulse rounded-xl bg-gray-200/80";
  return (
    <main className="mx-auto max-w-3xl px-3 pb-16 pt-4" aria-busy="true" aria-live="polite">
      <div className="mb-3 flex items-center justify-between">
        <div className={`${box} h-5 w-16`} />
        <div className={`${box} h-6 w-24`} />
        <div className={`${box} h-5 w-16`} />
      </div>

      <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm text-blue-700">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        진행 현황을 집계하는 중입니다…
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${box} h-20`} style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      <div className={`${box} mb-3 h-36`} />
      <div className="mb-3 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${box} h-16`} style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      <div className={`${box} mb-3 h-64`} />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${box} h-11`} />
        ))}
      </div>
    </main>
  );
}
