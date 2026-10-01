import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // 기본 제목은 첫 화면(프로젝트 선택) 기준. 각 프로젝트 페이지는 자기 제목을 따로 둔다.
  title: { default: "산출물 관리", template: "%s" },
  description: "프로젝트별 설치·실사 사진첩 산출물 관리",
  // 모바일 최적화: 전화번호 자동 링크 방지 + 홈 화면 추가 시 전체화면 앱처럼 동작
  formatDetection: { telephone: false, address: false, email: false },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "산출물 관리" },
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
