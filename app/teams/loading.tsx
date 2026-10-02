import PageSkeleton from "@/components/PageSkeleton";

export default function TeamsLoading() {
  return <PageSkeleton label="설치팀별 현황을 집계하는 중입니다…" rows={["h-12", "h-24", "h-16", "h-16", "h-16"]} />;
}
