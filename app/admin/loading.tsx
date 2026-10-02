import PageSkeleton from "@/components/PageSkeleton";

export default function AdminLoading() {
  return <PageSkeleton label="관리자 페이지를 여는 중입니다…" rows={["h-12", "h-12", "h-40", "h-40"]} />;
}
