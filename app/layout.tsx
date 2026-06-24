import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "B820 설치 사진첩",
  description: "인천 B820 버스 장비 설치 사진첩 업로드",
  // 모바일 최적화: 전화번호 자동 링크 방지 + 홈 화면 추가 시 전체화면 앱처럼 동작
  formatDetection: { telephone: false, address: false, email: false },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "B820 사진첩" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1d4ed8",
  viewportFit: "cover", // 전체화면 앱 모드에서 노치/홈 인디케이터 영역까지 대응
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen text-gray-900 antialiased">{children}</body>
    </html>
  );
}
