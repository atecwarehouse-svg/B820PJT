import PageSkeleton from "@/components/PageSkeleton";

export default function SafetyLoading() {
  return <PageSkeleton label="서약서 세션을 불러오는 중입니다…" rows={["h-12", "h-20", "h-20", "h-20"]} />;
}
