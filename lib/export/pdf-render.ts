// HTML → PDF (A4) 렌더링.
// - Vercel/AWS Lambda(서버리스 Linux): @sparticuz/chromium 번들 사용
// - 로컬 개발(Windows/macOS): 설치된 Chrome 또는 Edge 사용
import type { Browser } from "puppeteer-core";

function isServerless(): boolean {
  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.VERCEL ||
      process.env.VERCEL_ENV,
  );
}

async function launchBrowser(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;

  if (isServerless()) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
      defaultViewport: { width: 1240, height: 1754 }, // A4 @ ~150dpi
    });
  }

  // 로컬: 설치된 Chrome 채널 → 실패 시 Edge/Chrome 실행 경로 후보 순으로 시도
  const viewport = { width: 1240, height: 1754 };
  let lastErr: unknown;

  // 1) Chrome 정식 채널 자동 탐지
  try {
    return await puppeteer.launch({ channel: "chrome", headless: true, defaultViewport: viewport });
  } catch (e) {
    lastErr = e;
  }

  // 2) 알려진 실행 경로 후보 (Edge 우선 — Windows 기본 설치)
  const { existsSync } = await import("node:fs");
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].filter((p): p is string => Boolean(p) && existsSync(p!));

  for (const executablePath of candidates) {
    try {
      return await puppeteer.launch({ executablePath, headless: true, defaultViewport: viewport });
    } catch (e) {
      lastErr = e;
    }
  }

  throw new Error(
    "로컬에서 Chrome/Edge를 찾지 못했습니다. Chrome 설치 또는 PUPPETEER_EXECUTABLE_PATH 환경변수를 설정하세요. " +
      (lastErr instanceof Error ? lastErr.message : ""),
  );
}

export async function renderPdf(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    // 한글 폰트를 명시적으로 로드한 뒤, 폰트/이미지 로딩 완료까지 대기
    await page.evaluate(async () => {
      const d = document as any;
      try {
        await d.fonts.load("400 16px Pretendard");
        await d.fonts.load("700 16px Pretendard");
      } catch {}
      try {
        await d.fonts.ready;
      } catch {}
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((res) => {
                img.onload = img.onerror = () => res(null);
              }),
        ),
      );
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
