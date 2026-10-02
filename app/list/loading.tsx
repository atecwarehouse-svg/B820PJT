import PageSkeleton from "@/components/PageSkeleton";

export default function ListLoading() {
  return <PageSkeleton label="저장 목록을 불러오는 중입니다…" wide rows={["h-20", "h-24", "h-14", "h-14", "h-14", "h-14", "h-14"]} />;
}
