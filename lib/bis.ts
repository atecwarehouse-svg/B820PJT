// 인천 버스정보시스템(bus.incheon.go.kr) 조회 — 노선 검색·실시간 운행대수.
// 노선 스크린샷 화면에서 "지금 이 노선에 버스가 다니는지 / 아직 첫차 전인지"를 판단하는 데 쓴다.
// (공개 페이지가 쓰는 것과 같은 엔드포인트. 브라우저 UA가 아니면 차단된다.)

const BASE = "https://bus.incheon.go.kr";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

async function post(path: string, body: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE}/bis/search1.view`,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
    // 상대 서버가 응답을 안 주면 화면 전체가 멈추므로 8초에서 끊는다
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("버스정보시스템 응답을 읽지 못했습니다.");
  }
}

export interface BisRoute {
  routeId: string;
  routeNo: string;
  operator: string; // BIS상의 운수사
  origin: string; // 기점
  dest: string; // 종점
  firstWeekday: string; // 첫차 (주중)
  firstSat: string; // 첫차 (토)
  firstHoli: string; // 첫차 (일·공휴일)
}

interface RawRoute {
  routeid: string;
  routeno: string;
  compnm: string;
  originbstopkr: string;
  destbstopkr: string;
  first_tm: string;
  first_tm_sat: string;
  first_tm_holi: string;
}

// 우리 DB 노선명 → 실제 노선번호. "23(예비)" → "23", "인천e음45(예비)" → "인천e음45"
export function routeNoOf(route: string): string {
  return route.replace(/\((예비|여유)\)/g, "").replace(/\s+/g, " ").trim();
}

// 노선번호로 검색해 정확히 같은 번호의 노선을 찾는다.
// 같은 번호가 여럿이면(예: 4 / 4(강화)) 운수사 이름이 겹치는 쪽을 고른다.
export async function findRoute(routeNo: string, operator?: string): Promise<BisRoute | null> {
  const word = routeNoOf(routeNo);
  if (!word) return null;
  const json = (await post("/inq/selectRouteSearchList.do", { searchWord: word })) as {
    routeList?: RawRoute[];
  };
  const exact = (json.routeList ?? []).filter((r) => (r.routeno ?? "").trim() === word);
  if (exact.length === 0) return null;
  const norm = (s: string) => s.replace(/[()㈜\s]|주식회사|본사|영업소/g, "");
  const op = norm(operator ?? "");
  const pick =
    (op && exact.find((r) => norm(r.compnm).includes(op) || op.includes(norm(r.compnm)))) || exact[0];
  return {
    routeId: pick.routeid,
    routeNo: pick.routeno,
    operator: pick.compnm,
    origin: pick.originbstopkr,
    dest: pick.destbstopkr,
    firstWeekday: pick.first_tm,
    firstSat: pick.first_tm_sat,
    firstHoli: pick.first_tm_holi,
  };
}

// 지금 이 노선을 달리는 버스 — 차량번호 목록(BIS 기준 운행대수)
export async function runningBuses(routeId: string): Promise<string[]> {
  const json = (await post("/inq/selectBusLocList.do", { routeid: routeId, isPc: "true" })) as {
    busLocList?: { carregno?: string }[];
  };
  return (json.busLocList ?? []).map((b) => (b.carregno ?? "").trim()).filter(Boolean);
}

// 오늘 기준 첫차 시각 — 토요일·일요일은 주말 시각을 쓴다(요일은 KST 기준).
export function firstTimeToday(route: BisRoute, now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay(); // 0=일, 6=토
  if (day === 6) return route.firstSat || route.firstWeekday;
  if (day === 0) return route.firstHoli || route.firstSat || route.firstWeekday;
  return route.firstWeekday;
}

// "HH:mm"을 오늘(KST) 시각과 비교 — 첫차 전이면 true
export function beforeFirstTime(hhmm: string, now: Date = new Date()): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return false;
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const cur = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return cur < Number(m[1]) * 60 + Number(m[2]);
}
