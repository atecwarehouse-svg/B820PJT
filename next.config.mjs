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
    // @sparticuz/chromium의 bin(브로틀리 압축 크로미움) 파일을 PDF 라우트 번들에 포함.
    // (외부화만으로는 bin 파일이 누락되어 Vercel에서 "bin does not exist" 오류 발생)
    outputFileTracingIncludes: {
      "/api/export/pdf": ["./node_modules/@sparticuz/chromium/**"],
      "/api/export/pdf/[plate]": ["./node_modules/@sparticuz/chromium/**"],
    },
  },
};

export default nextConfig;
