// 라우트 로딩 화면 공통 뼈대 — app/<page>/loading.tsx 에서 쓴다 (서버 집계 전에 먼저 그려짐).
// 머리(알약·제목·알약) + 안내 줄 + 회색 블록 몇 개. rows 로 블록 높이 목록을 바꾼다.
export default function PageSkeleton({
  label,
  rows = ["h-14", "h-14", "h-14", "h-14", "h-14"],
  wide = false,
}: {
  label: string; // 예: "저장 목록을 불러오는 중입니다…"
  rows?: string[];
  wide?: boolean; // max-w-3xl (대시보드·목록) / max-w-md
}) {
  const box = "animate-pulse rounded-2xl bg-gray-200/80";
  return (
    <main className={`mx-auto ${wide ? "max-w-3xl px-3" : "max-w-md px-4"} pb-16 pt-4`} aria-busy="true" aria-live="polite">
      <div className="page-head">
        <div className={`${box} h-8 w-24 rounded-full`} />
        <div className={`${box} h-6 w-28`} />
        <div className={`${box} h-8 w-20 rounded-full`} />
      </div>
      <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl bg-blue-50 px-3 py-2.5 text-sm text-blue-700">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        {label}
      </div>
      <div className="space-y-2">
        {rows.map((h, i) => (
          <div key={i} className={`${box} ${h}`} style={{ animationDelay: `${i * 90}ms` }} />
        ))}
      </div>
    </main>
  );
}
