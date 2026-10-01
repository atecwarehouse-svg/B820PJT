import type { MetadataRoute } from "next";

// PWA 웹 매니페스트 — 홈 화면 추가 시 전체화면 앱처럼 실행되게 한다.
// Next.js가 자동으로 <link rel="manifest">를 연결한다.
// 첫 화면이 프로젝트 선택(프로젝트 산출물 관리)이라 앱 이름도 그에 맞춘다.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "프로젝트 산출물 관리",
    short_name: "프로젝트 산출물 관리",
    description: "프로젝트 산출물 관리 — 설치·실사 사진첩",
    start_url: "/",
    display: "standalone", // 주소창 없이 앱처럼 전체화면
    background_color: "#ffffff",
    theme_color: "#1d4ed8",
    orientation: "portrait",
    lang: "ko",
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
