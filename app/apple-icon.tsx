import { renderAppIcon } from "@/lib/icon-image";

// 아이폰 홈 화면 추가 시 아이콘. Next.js가 자동으로 <link rel="apple-touch-icon"> 연결.
// iOS가 모서리를 둥글게 처리하므로 불투명 정사각형으로 둔다.
export const runtime = "edge"; // og 폰트 로딩이 한글 경로에서 깨지는 문제 회피
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return renderAppIcon(180);
}
