// 업무일(작업 시간) 기준 날짜 변환 — 단일 출처.
// 작업 시간: 20:00 ~ 익일 07:00. 자정을 넘겨 새벽에 끝나므로,
// "완료일"은 작업 종료(07:00) 이전이면 전날(작업 시작일)에 귀속시킨다.
// 구현: KST 시각에서 7시간을 뺀 뒤의 달력 날짜 = 업무일.
//   예) 6/24 02:00 KST → (−7h) 6/23 19:00 → 업무일 6/23
//       6/24 07:00 KST → (−7h) 6/24 00:00 → 업무일 6/24 (작업 종료, 다음 업무일)

const SHIFT_END_HOUR = 7; // 업무일 경계 시각(이 시각 전이면 전날로)
const SHIFT_MS = SHIFT_END_HOUR * 3600000;
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30); // Excel 1900 날짜 시스템 기준일
const DAY_MS = 86400000;

function shiftedKstYmd(value: string | Date): { y: number; m: number; d: number } {
  const t = typeof value === "string" ? new Date(value) : value;
  const shifted = new Date(t.getTime() - SHIFT_MS);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", // DST 없음, 항상 UTC+9
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(shifted);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** 업무일 "YYYY-MM-DD" (KST, 07:00 이전이면 전날). */
export function workDateString(value: string | Date): string {
  const { y, m, d } = shiftedKstYmd(value);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 업무일의 Excel 날짜 직렬값 (다운로드 양식 H열용). */
export function workDateExcelSerial(value: string | Date): number {
  const { y, m, d } = shiftedKstYmd(value);
  return Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCH_UTC) / DAY_MS);
}
