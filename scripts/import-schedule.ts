/**
 * 설치 일정 임포트 — 양식에서 설치 예정일 + 시범설치 플래그를 vehicles에 적재.
 *
 *   - 차량리스트 시트: F=차량번호, B=운수사, C=노선, I=설치 예정일(planned_date)
 *   - 진행현황 시트("인천버스 B800단말기 설치 진행현황"): 비고열에 "시범설치"인
 *     영업소(B=운수사, C=노선)에 속한 차량은 is_pilot=true
 *
 * 사용법:
 *   npm run import:schedule -- "C:/경로/인천버스_설치_전개현황_YYMMDD.xlsx"
 *   (경로 생략 시 lib/export/templates/진행현황_template.xlsx 사용)
 *
 * 동작: plate 기준 upsert(operator/route/planned_date/is_pilot 갱신). 삭제 안 함.
 */

import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const xlsxPath = resolve(
  process.argv[2] ?? "lib/export/templates/진행현황_template.xlsx",
);
const VEHICLE_SHEET = "차량리스트";
const PROGRESS_SHEET = "인천버스 B800단말기 설치 진행현황";
const PILOT_KEYWORD = "시범설치";
const CHUNK = 500;

// 셀 값 → 트림 문자열 (리치텍스트/하이퍼링크 객체 처리)
function txt(v: unknown): string {
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
function toDate(v: unknown): string | null {
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

const pilotKey = (op: string, route: string) => `${op}|||${route}`;

async function main() {
  console.log(`엑셀 읽는 중: ${xlsxPath}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);

  // 1) 진행현황 시트에서 시범설치 영업소(운수사+노선) 집합 수집
  const pilotKeys = new Set<string>();
  const pws = wb.getWorksheet(PROGRESS_SHEET);
  if (pws) {
    for (let r = 1; r <= pws.rowCount; r++) {
      const row = pws.getRow(r);
      const op = txt(row.getCell("B").value);
      const route = txt(row.getCell("C").value);
      if (!op || !route) continue;
      // 비고열(I~N) 중 하나라도 "시범설치"면 시범설치 영업소
      let isPilot = false;
      for (const col of ["I", "J", "K", "L", "M", "N"]) {
        if (txt(row.getCell(col).value).includes(PILOT_KEYWORD)) {
          isPilot = true;
          break;
        }
      }
      if (isPilot) pilotKeys.add(pilotKey(op, route));
    }
  } else {
    console.warn(`"${PROGRESS_SHEET}" 시트를 못 찾음 → 시범설치 표시 생략`);
  }
  console.log(`시범설치 영업소: ${pilotKeys.size}곳`);

  // 2) 차량리스트 시트에서 차량별 예정일 + 시범설치 여부 구성
  const vws = wb.getWorksheet(VEHICLE_SHEET);
  if (!vws) {
    console.error(`"${VEHICLE_SHEET}" 시트를 찾을 수 없습니다.`);
    process.exit(1);
  }

  type Row = {
    plate: string;
    operator: string;
    route: string;
    planned_date: string | null;
    is_pilot: boolean;
  };
  const map = new Map<string, Row>();
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
    const is_pilot = pilotKeys.has(pilotKey(operator, route));
    if (is_pilot) pilotCount++;
    map.set(plate, { plate, operator, route, planned_date, is_pilot });
  }
  const records = [...map.values()];
  console.log(
    `적재 대상: ${records.length}대 (빈칸 제외 ${skipped}행) · 시범설치 차량 ${pilotCount}대`,
  );

  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  let done = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const { error } = await supabase.from("vehicles").upsert(chunk, { onConflict: "plate" });
    if (error) {
      console.error(`업로드 실패 (offset ${i}):`, error.message);
      process.exit(1);
    }
    done += chunk.length;
    console.log(`  ${done}/${records.length} 완료`);
  }

  const { count } = await supabase
    .from("vehicles")
    .select("*", { count: "exact", head: true })
    .not("planned_date", "is", null);
  console.log(`✅ 예정일 적재 완료 — planned_date 있는 차량 ${count}대`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
