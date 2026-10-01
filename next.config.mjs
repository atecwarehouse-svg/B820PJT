/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 빌드(배포) 시각 — 프로젝트 홈 하단 버전 표기용 (KST "2026-08-09 22:10").
  // 홈이 동적 페이지가 되어 모듈 상수로는 빌드 시각을 못 잡으므로 빌드 때 env로 박아 둔다.
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toLocaleString("sv-SE", {
      timeZone: "Asia/Seoul",
      dateStyle: "short",
      timeStyle: "short",
    }),
  },
  experimental: {
    // Node 런타임 서버 라우트 전용 패키지. 서버 번들에서 외부 모듈로 취급.
    serverComponentsExternalPackages: [
      "exceljs",
      "puppeteer-core",
      "@sparticuz/chromium",
    ],
    // @sparticuz/chromium의 bin(브로틀리 압축 크로미움) 파일을 PDF 라우트 번들에 포함.
    // (외부화만으로는 bin 파일이 누락되어 Vercel에서 "bin does not exist" 오류 발생)
    outputFileTracingIncludes: {
      "/api/export/pdf": ["./node_modules/@sparticuz/chromium/**"],
      "/api/export/pdf/[plate]": ["./node_modules/@sparticuz/chromium/**"],
      // 노선 스크린샷(인천버스정보 + 카카오맵 캡처)도 같은 크로미움을 쓴다
      "/api/route-shot/image": [
        "./node_modules/@sparticuz/chromium/**",
        "./fonts/**", // 서버리스 크롬에 없는 한글 폰트
      ],
    },
  },
};

export default nextConfig;
