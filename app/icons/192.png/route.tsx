import { renderAppIcon } from "@/lib/icon-image";

// 매니페스트용 192x192 아이콘 (안드로이드 홈 화면). /icons/192.png 로 제공.
export const runtime = "edge"; // og 폰트 로딩이 한글 경로에서 깨지는 문제 회피

export function GET() {
  return renderAppIcon(192);
}
