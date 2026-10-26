// 차량리스트 시트의 열 정의 — 새 양식(lib/export/templates/v2-master.xlsx) 1행 제목 기준.
// 업로드 파일은 제목 이름으로 열을 찾는다(순서가 달라도, 옛 B820 양식의 '기존 설치 예정일'·'완료여부'도 별칭으로 인식).
// parse-schedule(일정 업로드)·v2-form(양식 생성)·RawDataGuide(사용방법)가 같이 쓴다.
import type ExcelJS from "exceljs";
import { colName, colNum } from "@/lib/xlsx/sheet-xml";

export interface VehicleCol {
  col: string; // 마스터 양식 열
  name: string; // 제목(표시용)
  aliases?: string[]; // 다른 양식의 제목(정규화 후 비교)
  kind?: "date" | "number";
}

export const V2_COLS: VehicleCol[] = [
  { col: "A", name: "번호", aliases: ["no", "순번"], kind: "number" },
  { col: "B", name: "운수사" },
  { col: "C", name: "노선", aliases: ["노선번호"] },
  { col: "D", name: "차고지" },
  { col: "E", name: "운수사 주소", aliases: ["설치장소", "야간박차지주소", "주소", "차고지주소"] },
  { col: "F", name: "차량번호" },
  { col: "G", name: "실사 예정일", kind: "date" },
  { col: "H", name: "실사 완료여부" },
  { col: "I", name: "실사 완료일", kind: "date" },
  { col: "J", name: "설치 대상", aliases: ["대상"] },
  { col: "K", name: "설치 예정일", aliases: ["기존설치예정일", "예정일"], kind: "date" },
  { col: "L", name: "설치 완료여부", aliases: ["완료여부"] },
  { col: "M", name: "설치 완료일", aliases: ["완료일"], kind: "date" },
  { col: "N", name: "연식" },
  { col: "O", name: "제조사" },
  { col: "P", name: "모델명" },
  { col: "Q", name: "차대번호" },
  { col: "R", name: "연료 타입" },
  { col: "S", name: "저상/일반" },
  { col: "T", name: "돈통여부" },
  { col: "U", name: "영수증 여부" },
  { col: "V", name: "통합설치위치 (가능한곳)" },
  { col: "W", name: "A형브라켓 설치 여부" },
  { col: "X", name: "승차 설치 위치" },
  { col: "Y", name: "차량 휴즈타입" },
  { col: "Z", name: "타코 제조사" },
  { col: "AA", name: "타코연동여부 (can)" },
  { col: "AB", name: "도어스위치 타입" },
  { col: "AC", name: "도어종류 (앞문)" },
  { col: "AD", name: "도어종류 (뒷문)" },
  { col: "AE", name: "운전석 봉 종류", aliases: ["봉종류"] },
  { col: "AF", name: "하차봉 굵기" },
  { col: "AG", name: "케이블(봉) 매립여부" },
  { col: "AH", name: "하차단말기 개수" },
  { col: "AI", name: "빈좌석 표시기" },
  { col: "AJ", name: "초정밀 GPS" },
  { col: "AK", name: "안내방송" },
  { col: "AL", name: "비고" },
];
export const V2_LAST_COL = "AL";

/** 앱이 읽는 열(마스터 열 글자) */
export const VCOL = {
  listNo: "A", operator: "B", route: "C", depot: "D", address: "E", plate: "F",
  surveyDate: "G", target: "J", planned: "K", done: "L", doneDate: "M", year: "N", model: "P", tacho: "Z",
} as const;

export const normHeader = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const byName = new Map<string, string>();
for (const c of V2_COLS) for (const n of [c.name, ...(c.aliases ?? [])]) byName.set(normHeader(n), c.col);
export const colKind = new Map(V2_COLS.map((c) => [c.col, c.kind]));

/** 업로드 1행 제목들(인덱스 0=A열) → 마스터 열 → 업로드 열 번호(1=A) */
export function mapHeaders(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, i) => {
    const col = byName.get(normHeader(h));
    if (col && !map.has(col)) map.set(col, i + 1);
  });
  return map;
}

export type CellVal = string | number | null;
/** 차량 한 대 — 마스터 열 글자 → 값(날짜는 Excel 직렬값) */
export type VehicleRow = Record<string, CellVal>;

export const EXAMPLE_PLATE_PREFIX = "예)";
/** 설치 대상 여부 — J열이 비었거나 "대상"이면 대상(제외·말소 등은 비대상) */
export const isTarget = (row: VehicleRow) => {
  const t = String(row[VCOL.target] ?? "").trim();
  return t === "" || t === "대상";
};
export const isExample = (row: VehicleRow) => String(row[VCOL.plate] ?? "").trim().startsWith(EXAMPLE_PLATE_PREFIX);

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
export const serialFromYmd = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCH) / 86400000);
};
export const ymdFromSerial = (n: number) => new Date(EXCEL_EPOCH + Math.round(n) * 86400000).toISOString().slice(0, 10);

// 셀 값 → 트림 문자열 (리치텍스트/하이퍼링크/수식 결과)
export function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("").trim();
    if ("text" in o) return String(o.text).trim();
    if ("result" in o) return cellText(o.result);
    return "";
  }
  return String(v).trim();
}

// 셀 값 → YYYY-MM-DD | null ("2026.7.30"·"2026/07/30" 텍스트는 시간대 변환 없이 조합)
export function cellDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "object" && v !== null && "result" in (v as object)) return cellDate((v as { result: unknown }).result);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return ymdFromSerial(v);
  const s = String(v).trim();
  const m = /^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\.?$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function cellVal(v: unknown, kind?: "date" | "number"): CellVal {
  if (v == null || v === "") return null;
  if (kind === "date") {
    const ymd = cellDate(v);
    return ymd ? serialFromYmd(ymd) : cellText(v) || null;
  }
  if (typeof v === "object" && v !== null && "result" in (v as object)) v = (v as { result: unknown }).result;
  if (typeof v === "number") return v;
  if (v instanceof Date) return serialFromYmd(v.toISOString().slice(0, 10));
  const t = cellText(v);
  if (kind === "number" && /^\d+$/.test(t)) return Number(t);
  return t || null;
}

/** 양식에 없는 제목의 열(사용자가 추가한 열) — 행에는 EXTRA_PREFIX+제목 키로 담기고, 다운로드 때 비고 뒤에 그대로 붙는다. */
export const EXTRA_PREFIX = "x:";

/** 차량리스트 시트 → 마스터 열로 정리한 행 목록(차량번호 없는 행 제외). 제목이 하나도 안 맞으면 B820 옛 자리 글자로 읽는다. */
export function readVehicleTable(ws: ExcelJS.Worksheet): { map: Map<string, number>; rows: VehicleRow[]; rowNos: number[]; extras: string[] } {
  const headers: string[] = [];
  const h = ws.getRow(1);
  for (let c = 1; c <= Math.max(ws.columnCount, colNum(V2_LAST_COL)); c++) headers.push(cellText(h.getCell(c).value));
  let map = mapHeaders(headers);
  const extras: { name: string; idx: number }[] = [];
  if (!map.has(VCOL.plate)) {
    // 옛 B820 양식 고정 자리 (제목 없는 파일 대비)
    map = new Map(Object.entries({ A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, L: 7, M: 8, K: 9, N: 10, P: 12, Z: 21 }));
  } else {
    const used = new Set(map.values());
    headers.forEach((name, i) => {
      if (name && !used.has(i + 1) && !extras.some((e) => normHeader(e.name) === normHeader(name))) extras.push({ name, idx: i + 1 });
    });
  }
  const rows: VehicleRow[] = [];
  const rowNos: number[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const plate = cellText(row.getCell(map.get(VCOL.plate)!).value);
    if (!plate) continue;
    const out: VehicleRow = {};
    for (const [col, idx] of map) {
      const v = cellVal(row.getCell(idx).value, colKind.get(col));
      if (v !== null) out[col] = v;
    }
    for (const e of extras) {
      const raw = row.getCell(e.idx).value;
      const v = raw instanceof Date ? cellText(raw) : cellVal(raw); // 추가 열은 서식이 없어 날짜는 글자로
      if (v !== null) out[EXTRA_PREFIX + e.name] = v;
    }
    out[VCOL.plate] = plate;
    rows.push(out);
    rowNos.push(r);
  }
  return { map, rows, rowNos, extras: extras.map((e) => e.name) };
}

export { colName };
