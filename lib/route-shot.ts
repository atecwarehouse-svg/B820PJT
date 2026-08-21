// 노선 스크린샷 — 인천버스정보(왼쪽) + 카카오맵(오른쪽)을 한 장으로 합쳐 준다.
// 폰에서 분할화면으로 두 앱을 띄워 확인하던 것을 버튼 하나로 대신한다.
//
// 캡처 방식: headless 크롬으로 두 사이트를 모바일 화면(480×1040)으로 열어 각각 찍고,
// 두 이미지를 나란히 붙인 HTML을 한 번 더 찍어 한 장으로 만든다(추가 라이브러리 없이).

import type { Browser, Page } from "puppeteer-core";

const PANE = { width: 480, height: 1040, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-F956N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

// 카카오맵 앱 설치 유도 팝업·배너 제거
const KAKAO_KILL = `(() => {
  document.body.classList.remove("dim_open");
  document.querySelectorAll(".comm_popup, .dimmed_layer, .leverage_layer, .banner_app").forEach(function (el) { el.remove(); });
  return true;
})()`;

function isServerless(): boolean {
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL || process.env.VERCEL_ENV);
}

async function launch(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  if (isServerless()) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
      defaultViewport: PANE,
    });
  }
  const { existsSync } = await import("node:fs");
  try {
    return await puppeteer.launch({ channel: "chrome", headless: true, defaultViewport: PANE });
  } catch {
    const candidates = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ].filter((p): p is string => Boolean(p) && existsSync(p!));
    for (const executablePath of candidates) {
      try {
        return await puppeteer.launch({ executablePath, headless: true, defaultViewport: PANE });
      } catch {
        // 다음 후보
      }
    }
    throw new Error("크롬을 찾지 못했습니다.");
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function newPane(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setUserAgent(MOBILE_UA);
  await page.setViewport(PANE);
  return page;
}

// 왼쪽: 인천버스정보 노선 상세(정류장·실시간 버스 위치)
async function shotBis(browser: Browser, routeNo: string, routeId: string): Promise<string> {
  const page = await newPane(browser);
  try {
    await page.goto("https://bus.incheon.go.kr/bis/search1.view", {
      waitUntil: "networkidle2",
      timeout: 45000,
    });
    await page.evaluate(
      `(() => { const el = document.querySelector("#input_total_search"); if (el) el.value = ${JSON.stringify(routeNo)}; })()`,
    );
    await page.click("#btn_total_search");
    await wait(2500);
    const ok = await page.evaluate(
      `(() => { const li = document.getElementById(${JSON.stringify(routeId)}); const a = li && li.querySelector("a.nosun"); if (!a) return false; a.click(); return true; })()`,
    );
    if (!ok) throw new Error(`버스정보시스템에서 ${routeNo}번 노선을 찾지 못했습니다.`);
    await wait(4000);
    return (await page.screenshot({ encoding: "base64" })) as string;
  } finally {
    await page.close();
  }
}

// 오른쪽: 카카오맵 노선 지도(경로 + 실시간 버스 마커)
async function shotKakao(browser: Browser, routeNo: string): Promise<string> {
  const page = await newPane(browser);
  try {
    const q = `인천 ${routeNo}번버스`;
    await page.goto(`https://m.map.kakao.com/actions/searchView?q=${encodeURIComponent(q)}`, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });
    await wait(2000);
    // 검색 결과에서 노선번호가 정확히 같은 버스의 '지도' 버튼 클릭
    const ok = await page.evaluate(
      `(() => {
        const items = document.querySelectorAll('li.search_item[data-type="bus"]');
        for (const li of items) {
          if ((li.getAttribute("data-title") || "").trim() !== ${JSON.stringify(routeNo)}) continue;
          const btn = li.querySelector(".link_map");
          if (btn) { btn.click(); return true; }
        }
        return false;
      })()`,
    );
    if (!ok) throw new Error(`카카오맵에서 ${routeNo}번 노선을 찾지 못했습니다.`);
    await wait(4000);
    await page.evaluate(KAKAO_KILL);
    await wait(500);
    return (await page.screenshot({ encoding: "base64" })) as string;
  } finally {
    await page.close();
  }
}

export interface RouteShot {
  png: Buffer;
  bisFailed?: string;
  kakaoFailed?: string;
}

// 두 화면을 좌·우로 붙인 한 장(제목줄 포함). 한쪽이 실패하면 그 자리에 사유를 적는다.
export async function captureRouteShot(opts: {
  routeNo: string;
  routeId: string;
  title: string; // 예: "삼환교통 · 4번 (2026-08-22 03:10)"
}): Promise<RouteShot> {
  const browser = await launch();
  try {
    const [bis, kakao] = await Promise.all([
      shotBis(browser, opts.routeNo, opts.routeId).catch((e: unknown) => e as Error),
      shotKakao(browser, opts.routeNo).catch((e: unknown) => e as Error),
    ]);
    const paneHtml = (shot: string | Error, name: string) =>
      typeof shot === "string"
        ? `<img src="data:image/png;base64,${shot}" alt="${name}">`
        : `<div class="err"><b>${name}</b><br>${shot.message}</div>`;

    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 1090, deviceScaleFactor: 2 });
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{width:960px;font-family:'Malgun Gothic',sans-serif;background:#fff}
        h1{font-size:15px;padding:8px 10px;background:#1d4ed8;color:#fff}
        .row{display:flex}
        .row>*{width:480px;height:1040px;object-fit:cover;display:block;border-right:1px solid #ddd}
        .err{display:flex;align-items:center;justify-content:center;text-align:center;
             background:#f8fafc;color:#b91c1c;font-size:13px;line-height:1.6;padding:20px}
      </style>
      <h1>${opts.title}</h1>
      <div class="row">${paneHtml(bis, "인천버스정보")}${paneHtml(kakao, "카카오맵")}</div>`,
      { waitUntil: "load" },
    );
    const png = (await page.screenshot({ type: "png" })) as Buffer;
    await page.close();
    return {
      png: Buffer.from(png),
      bisFailed: bis instanceof Error ? bis.message : undefined,
      kakaoFailed: kakao instanceof Error ? kakao.message : undefined,
    };
  } finally {
    await browser.close();
  }
}
