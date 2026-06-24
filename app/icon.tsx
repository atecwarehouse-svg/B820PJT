import { renderAppIcon } from "@/lib/icon-image";

// 파비콘/앱 아이콘 (브라우저 탭·북마크). Next.js가 자동으로 <link rel="icon"> 연결.
export const runtime = "edge"; // og 폰트 로딩이 한글 경로에서 깨지는 문제 회피
export const size = { width: 256, height: 256 };
export const contentType = "image/png";

export default function Icon() {
  return renderAppIcon(256);
}
