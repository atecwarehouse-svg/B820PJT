/**
 * 진행현황 양식(xlsx)에서 차량별 설치 예정일(planned_date) + 시범설치(is_pilot)를 파싱.
 *
 *   - 차량리스트 시트: A=번호(list_no), F=차량번호, B=운수사, C=노선,
 *     I=설치 예정일(planned_date), J=연식(year), L=모델명(model), U=타코 제조사(tacho)
 *   - 시범설치: 예정일(I열)이 PILOT_CUTOFF(2026-07-30) 이전이면 is_pilot=true
 *     (2026-07-10 기준 변경 — 이전의 진행현황 시트 비고란 "시범설치" 글자 판정은 폐기)
 *
 * scripts/import-schedule.ts(파일 경로 임포트)와 /api/import/schedule(웹 업로드)가
 * 동일 로직을 쓰도록 공용화한 파서. vehicles upsert 페이로드 형태로 반환.
 */

import ExcelJS from "exceljs";

const VEHICLE_SHEET = "차량리스트";

// 시범설치 컷오프 — 설치 예정일이 이 날짜 이전(미만)인 차량은 시범설치.
export const PILOT_CUTOFF = "2026-07-30";

export interface ScheduleRow {
  plate: string;
  operator: string;
  route: string;
  planned_date: string | null;
  is_pilot: boolean;
  year: string | null; // 연식 (차량리스트 J열)
  model: string | null; // 모델명 (차량리스트 L열)
  list_no: number | null; // 번호 (차량리스트 A열)
  tacho: string | null; // 타코 제조사 (차량리스트 U열) — 배차표 '타코확인' 표시용
}

export interface ParseResult {
  rows: ScheduleRow[];
  pilotCount: number;
  skipped: number;
}

// 셀 값 → 트림 문자열 (리치텍스트/하이퍼링크 객체 처리)
export function txt(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((t) => t.text).join("").trim();
    }
    if ("text" in o) return String(o.text).trim();
    if ("result" in o) return String(o.result).trim();
  }
  return String(v).trim();
}

// 셀 값 → YYYY-MM-DD (date) | null
export function toDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel 직렬값 → 날짜 (1900 시스템)
    const ms = Date.UTC(1899, 11, 30) + v * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function parseWorkbook(wb: ExcelJS.Workbook): Promise<ParseResult> {
  // 차량리스트 시트에서 차량별 예정일 + 시범설치 여부 구성
  const vws = wb.getWorksheet(VEHICLE_SHEET);
  if (!vws) {
    throw new Error(`"${VEHICLE_SHEET}" 시트를 찾을 수 없습니다. 진행현황 양식인지 확인해주세요.`);
  }

  const map = new Map<string, ScheduleRow>();
  let skipped = 0;
  let pilotCount = 0;
  for (let r = 2; r <= vws.rowCount; r++) {
    const row = vws.getRow(r);
    const plate = txt(row.getCell("F").value);
    if (!plate) continue;
    const operator = txt(row.getCell("B").value);
    const route = txt(row.getCell("C").value);
    if (!operator || !route) {
      skipped++;
      continue; // vehicles.operator/route 는 not null
    }
    const planned_date = toDate(row.getCell("I").value);
    const year = txt(row.getCell("J").value) || null;
    const model = txt(row.getCell("L").value) || null;
    const listRaw = txt(row.getCell("A").value);
    const list_no = /^\d+$/.test(listRaw) ? Number(listRaw) : null;
    const tacho = txt(row.getCell("U").value) || null;
    const is_pilot = planned_date !== null && planned_date < PILOT_CUTOFF;
    if (is_pilot) pilotCount++;
    map.set(plate, { plate, operator, route, planned_date, is_pilot, year, model, list_no, tacho });
  }

  return { rows: [...map.values()], pilotCount, skipped };
}

/** 파일 경로에서 읽어 파싱 (스크립트용). */
export async function parseScheduleFile(path: string): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  return parseWorkbook(wb);
}

/** 버퍼에서 읽어 파싱 (웹 업로드용). */
export async function parseScheduleBuffer(buffer: Buffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS 타입은 Node Buffer를 직접 받지 못해 ArrayBuffer로 캐스팅
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return parseWorkbook(wb);
}
