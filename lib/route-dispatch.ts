// 노선별 배차표(운수사가 주는 엑셀 시간표) — 검수자용 참고 뷰. 기존 배차표(dispatch_times)와는 별개.
//   회사(운수사명 첫 단어: "공항리무진 본사"·"공항리무진 인천공항영업소" → "공항리무진")·날짜마다 파일 1건을
//   app_settings `route_dispatch:<회사>:<YYYY-MM-DD>` 에 저장한다(일자별 업로드, 같은 날짜를 다시 올리면 교체).
//   한국공항리무진·공항리무진은 서로 다른 회사.
//   필요한 건 아침 첫 출발뿐이라 04:00 ~ 08:59 에 첫 출발하는 차량만 남긴다.

export interface RouteDispatchRow {
  no: number; // 차번(호수)
  plate: string; // 차번 → 차량번호(규칙 없으면 "")
  time: string; // 첫 출발 "HH:MM"
  from: string; // 출발지(머리글)
  note: string; // 첫 출발 앞뒤 메모(경유·지원 등)
}
export interface RouteDispatchBlock {
  route: string; // "6015 (명동)"
  day: string; // "평일" | "토·휴일" | ""
  rows: RouteDispatchRow[];
}
export interface RouteDispatchTable {
  company: string;
  fileName: string;
  date: string; // 배차 날짜 "YYYY-MM-DD" — 파일 안 날짜(없으면 올린 날)
  uploadedAt: string;
  blocks: RouteDispatchBlock[];
}

export const WINDOW_FROM = "04:00";
export const WINDOW_TO = "09:00"; // 미만

// 그 날짜에 적용되는 표 — 토·일·공휴일은 "토·휴일", 나머지는 "평일". 화면은 이 표 하나만 보여준다.
// ponytail: 평일에 걸리는 공휴일을 손으로 적어 둠(프로젝트 기간분) — 기간이 늘면 날짜 추가.
const WEEKDAY_HOLIDAYS = new Set(["2026-12-25", "2027-01-01"]);
export function dayTypeOf(date: string): "평일" | "토·휴일" {
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
  return wd === 0 || wd === 6 || WEEKDAY_HOLIDAYS.has(date) ? "토·휴일" : "평일";
}

// 그 배차 날짜에 맞는 표의 블록들. 파일에 평일/휴일 구분이 없거나 해당 표가 없으면 첫 표를 그대로.
export function blocksFor(table: RouteDispatchTable): RouteDispatchBlock[] {
  const want = table.date ? dayTypeOf(table.date) : "";
  const day = table.blocks.some((b) => b.day === want) ? want : (table.blocks[0]?.day ?? "");
  return table.blocks.filter((b) => b.day === day);
}

// 차량번호 → 첫 출발 시간(같은 차량이 여러 노선에 나오면 가장 이른 시간) — 배차표 '나가는 시간' 자동 입력용
export function firstTimes(table: RouteDispatchTable): Map<string, { time: string; from: string }> {
  const m = new Map<string, { time: string; from: string }>();
  for (const b of blocksFor(table)) {
    for (const r of b.rows) {
      if (r.plate && (!m.has(r.plate) || r.time < m.get(r.plate)!.time)) m.set(r.plate, { time: r.time, from: r.from });
    }
  }
  return m;
}

// 당일 배차표(운행종료 시간) 저장 키 — 캡쳐용 표에만 쓰인다. 값: { fileName, date, ends: { 차량번호: "HH:MM" } }
export const dayDispatchKey = (company: string, date: string) => `day_dispatch:${company}:${date}`;
// 운행종료 = 마지막 T1 출발 + 2시간(사용자 지정 기준)
export const END_AFTER_T1_MIN = 120;
export function addMinutes(time: string, min: number): string {
  const t = (+time.slice(0, 2) * 60 + +time.slice(3) + min) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// 업로드 결과 한 줄 — "노선 17개 · 차량 207대 읽음" + 빠진 것(노선명 못 찾은 블록, 차량번호 못 만든 차번)
export function readSummary(s?: { routes: string[]; plates: string[]; unmapped: number[] }): string {
  if (!s) return "";
  const parts = [`노선 ${s.routes.length}개 · 차량 ${s.plates.length}대 읽음`];
  if (s.routes.includes("노선 미상")) parts.push("⚠ 노선명을 못 찾은 표가 있음");
  if (s.unmapped.length) {
    parts.push(`⚠ 차량번호를 못 만든 차번 ${s.unmapped.length}개: ${s.unmapped.slice(0, 15).join(", ")}${s.unmapped.length > 15 ? " …" : ""}`);
  }
  return parts.join(" · ");
}

export const routeDispatchPrefix = (company: string) => `route_dispatch:${company}:`;
export const routeDispatchKey = (company: string, date: string) => routeDispatchPrefix(company) + date;
export const companyOf = (operator: string) => operator.trim().split(/\s+/)[0] ?? "";

// 차번(호수) → 차량번호. 회사별 규칙(범위, 앞부분, 뒤에 붙는 차번 자릿수).
// ponytail: 규칙을 코드에 둠 — 다른 회사 규칙을 받으면 여기에 추가(자주 바뀌면 관리자 설정으로).
const PLATE_RULES: Record<string, [from: number, to: number, prefix: string, digits: number][]> = {
  공항리무진: [
    [18, 46, "서울75사11", 2],
    [78, 88, "서울71사22", 2],
    [121, 300, "서울70사8", 3],
    [310, 478, "서울71사2", 3],
  ],
};
// rules = 프로젝트 설정의 차번 규칙(lib/features parsePlateRules). 없으면 내장 규칙.
export function plateOf(company: string, no: number, rules: typeof PLATE_RULES = PLATE_RULES): string {
  const r = rules[company]?.find(([a, b]) => no >= a && no <= b);
  return r ? r[2] + String(no).padStart(r[3], "0") : "";
}

// 진행현황 노선명 갱신 — 배차표 엑셀에서 차량이 속한 노선으로 vehicles.route를 바꿀 목록.
// 표기는 기존 진행현황 것을 유지: 노선 번호(6015, N6000)로 맞춰 그 번호에 이미 쓰이는 이름(가장 흔한 것)을 쓴다.
// 그 번호의 기존 이름이 없으면 건드리지 않는다.
const routeNo = (s: string | null) => /^N?\d{3,4}/.exec((s ?? "").trim())?.[0] ?? "";
export function routeChanges(
  vehicles: { plate: string; route: string | null }[],
  plateRoutes: Record<string, string>, // 차량번호 → 엑셀 노선
): { plate: string; route: string }[] {
  const count = new Map<string, Map<string, number>>();
  for (const v of vehicles) {
    const no = routeNo(v.route);
    if (!no) continue;
    const m = count.get(no) ?? new Map<string, number>();
    m.set(v.route!, (m.get(v.route!) ?? 0) + 1);
    count.set(no, m);
  }
  const out: { plate: string; route: string }[] = [];
  for (const v of vehicles) {
    const names = count.get(routeNo(plateRoutes[v.plate] ?? ""));
    if (!names) continue;
    const route = [...names].sort((a, b) => b[1] - a[1])[0][0];
    if (route !== v.route) out.push({ plate: v.plate, route });
  }
  return out;
}
