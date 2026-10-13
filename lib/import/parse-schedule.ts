/**
 * 진행현황 양식(xlsx) 차량리스트 → 차량별 설치 예정일(planned_date) + 시범설치(is_pilot) 파싱.
 *
 *   - 열은 1행 제목 이름으로 찾는다(lib/import/vehicle-columns.ts): 차량번호·운수사·노선·설치 예정일·연식·모델명·번호·타코 제조사·차고지.
 *     새 양식(설치 예정일 K열)과 옛 B820 양식(기존 설치 예정일 I열) 모두 인식.
 *   - 설치 대상(J열)이 "제외"·"말소" 등 대상이 아닌 차량은 등록하지 않는다(excluded).
 *   - 시범설치: 예정일이 PILOT_CUTOFF(2026-07-30) 이전이면 is_pilot=true (B820 전용 — 다른 프로젝트는 라우트가 끈다)
 *
 * scripts/import-schedule.ts(파일 경로)와 /api/import/schedule(웹 업로드)가 같은 로직을 쓴다. vehicles upsert 페이로드 형태로 반환.
 */

import ExcelJS from "exceljs";
import { VCOL, cellText, cellDate, isExample, isTarget, readVehicleTable, ymdFromSerial, type VehicleRow } from "./vehicle-columns";

const VEHICLE_SHEET = "차량리스트";

// 시범설치 컷오프 — 설치 예정일이 이 날짜 이전(미만)인 차량은 시범설치.
export const PILOT_CUTOFF = "2026-07-30";

export interface ScheduleRow {
  plate: string;
  operator: string;
  route: string;
  planned_date: string | null;
  is_pilot: boolean;
  year: string | null; // 연식
  model: string | null; // 모델명
  list_no: number | null; // 번호
  tacho: string | null; // 타코 제조사 — 배차표 '타코확인' 표시용
}

export interface ParseResult {
  rows: ScheduleRow[];
  pilotCount: number;
  skipped: number; // 운수사·노선이 비어 건너뛴 행
  excluded: number; // 설치 대상이 아닌(제외·말소) 행
  depots: Map<string, string>; // "운수사|||노선" → 차고지(그룹의 첫 값)
}

// 다른 모듈이 쓰는 셀 변환 (호환 유지)
export const txt = cellText;
export const toDate = cellDate;

const str = (v: VehicleRow[string]) => (v == null ? "" : String(v).trim());

function parseWorkbook(wb: ExcelJS.Workbook): ParseResult {
  const vws = wb.getWorksheet(VEHICLE_SHEET);
  if (!vws) {
    throw new Error(`"${VEHICLE_SHEET}" 시트를 찾을 수 없습니다. 진행현황 양식인지 확인해주세요.`);
  }
  const { rows: table } = readVehicleTable(vws);

  const map = new Map<string, ScheduleRow>();
  const depots = new Map<string, string>();
  let skipped = 0;
  let excluded = 0;
  let pilotCount = 0;
  for (const v of table) {
    if (isExample(v)) continue; // 빈 양식의 작성 예시("예) 인천70바4005")
    if (!isTarget(v)) {
      excluded++;
      continue;
    }
    const plate = str(v[VCOL.plate]);
    const operator = str(v[VCOL.operator]);
    const route = str(v[VCOL.route]);
    if (!operator || !route) {
      skipped++;
      continue; // vehicles.operator/route 는 not null
    }
    const pl = v[VCOL.planned];
    const planned_date = typeof pl === "number" ? ymdFromSerial(pl) : cellDate(pl);
    const listRaw = str(v[VCOL.listNo]);
    const list_no = /^\d+$/.test(listRaw) ? Number(listRaw) : null;
    const is_pilot = planned_date !== null && planned_date < PILOT_CUTOFF;
    if (is_pilot) pilotCount++;
    map.set(plate, {
      plate, operator, route, planned_date, is_pilot,
      year: str(v[VCOL.year]) || null,
      model: str(v[VCOL.model]) || null,
      list_no,
      tacho: str(v[VCOL.tacho]) || null,
    });
    const depot = str(v[VCOL.depot]);
    const key = `${operator}|||${route}`;
    if (depot && !depots.has(key)) depots.set(key, depot);
  }

  return { rows: [...map.values()], pilotCount, skipped, excluded, depots };
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
