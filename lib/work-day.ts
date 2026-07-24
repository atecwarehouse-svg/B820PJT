// 업무일(작업 시간) 기준 날짜 변환 — 단일 출처.
// 작업 시간: 20:00 ~ 익일 12:00. 자정을 넘겨 낮까지 이어지므로,
// "완료일"은 작업 종료(12:00) 이전이면 전날(작업 시작일)에 귀속시킨다.
// 구현: KST 시각에서 12시간을 뺀 뒤의 달력 날짜 = 업무일.
//   예) 6/24 02:00 KST → (−12h) 6/23 14:00 → 업무일 6/23
//       6/24 11:00 KST → (−12h) 6/23 23:00 → 업무일 6/23
//       6/24 12:00 KST → (−12h) 6/24 00:00 → 업무일 6/24 (작업 종료, 다음 업무일)

const SHIFT_END_HOUR = 12; // 업무일 경계 시각(이 시각 전이면 전날로)
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

/** 업무일 "YYYY-MM-DD" (KST, 12:00 이전이면 전날). */
export function workDateString(value: string | Date): string {
  const { y, m, d } = shiftedKstYmd(value);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** KST 달력 날짜 "YYYY-MM-DD" (업무일 시프트 없음 — 설치일자 등 표기용).
 *  서버는 UTC라 DB current_date/new Date()를 그대로 쓰면 KST 00~09시에 전날이 된다. */
export function kstDateString(value: string | Date = new Date()): string {
  const t = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(t);
  return parts; // en-CA = "YYYY-MM-DD"
}

/** 업무일의 Excel 날짜 직렬값 (다운로드 양식 H열용). */
export function workDateExcelSerial(value: string | Date): number {
  const { y, m, d } = shiftedKstYmd(value);
  return Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCH_UTC) / DAY_MS);
}

/** "YYYY-MM-DD"(달력 날짜) → Excel 날짜 직렬값 (시프트 없음, 진행현황 기준일 A3/A10용). */
export function excelSerialFromDate(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCH_UTC) / DAY_MS);
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
/** "YYYY-MM-DD" → "M/D (요일)" 라벨. */
export function weekdayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
  return `${m}/${d} (${dow})`;
}
