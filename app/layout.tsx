import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import NavLoading from "@/components/NavLoading";
import localFont from "next/font/local";
import "./globals.css";

// 에이텍 홈페이지 본문 글꼴 SUIT(SIL OFL) — 파일을 앱에 넣어 외부 서버 없이 쓴다. tokens.css 의 --font-body 가 이 변수를 읽는다.
const suit = localFont({ src: "./fonts/SUIT-Variable.woff2", variable: "--font-suit", weight: "100 900", display: "swap" });

export const metadata: Metadata = {
  // 기본 제목은 첫 화면(프로젝트 선택) 기준. 각 프로젝트 페이지는 자기 제목을 따로 둔다.
  title: { default: "프로젝트 산출물 관리", template: "%s" },
  description: "프로젝트 산출물 관리 — 설치·실사 사진첩",
  // 모바일 최적화: 전화번호 자동 링크 방지 + 홈 화면 추가 시 전체화면 앱처럼 동작
  formatDetection: { telephone: false, address: false, email: false },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "프로젝트 산출물 관리" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#c70a51", // 에이텍 레드(tokens.css --brand-600)
  viewportFit: "cover", // 전체화면 앱 모드에서 노치/홈 인디케이터 영역까지 대응
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={suit.variable}>
      <body className="min-h-screen text-gray-900 antialiased">
        {/* 페이지 이동 로딩 오버레이 — useSearchParams를 쓰므로 Suspense 경계 필요 */}
        <Suspense fallback={null}>
          <NavLoading />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
