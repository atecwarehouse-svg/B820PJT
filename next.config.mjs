/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Node 런타임 서버 라우트 전용 패키지. 서버 번들에서 외부 모듈로 취급.
    serverComponentsExternalPackages: [
      "exceljs",
      "puppeteer-core",
      "@sparticuz/chromium",
    ],
  },
};

export default nextConfig;
