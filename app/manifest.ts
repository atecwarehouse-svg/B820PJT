import type { MetadataRoute } from "next";

// PWA 웹 매니페스트 — 홈 화면 추가 시 전체화면 앱처럼 실행되게 한다.
// Next.js가 자동으로 <link rel="manifest">를 연결한다.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "B820 설치 사진첩",
    short_name: "B820 사진첩",
    description: "인천 B820 버스 장비 설치 사진첩",
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
