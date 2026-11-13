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
export function plateOf(company: string, no: number): string {
  const r = PLATE_RULES[company]?.find(([a, b]) => no >= a && no <= b);
  return r ? r[2] + String(no).padStart(r[3], "0") : "";
}
