/**
 * 설치 전개현황 xlsx → Supabase vehicles 테이블 upsert (추가/운수사·노선 수정).
 *
 * 엑셀 형식: "차량리스트" 시트, 1행 헤더, 2행부터 데이터
 *   B열 = 운수사, C열 = 노선, F열 = 차량번호
 *
 * 사용법:
 *   npm run import:vehicles:xlsx -- "C:/경로/인천버스_설치_전개현황_YYMMDD.xlsx"
 *
 * 동작: plate 기준 upsert(추가 + 운수사/노선 갱신). 삭제는 하지 않는다(레코드 FK 보호).
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

const xlsxPath = resolve(process.argv[2] ?? "차량리스트.xlsx");
const SHEET = "차량리스트";
const CHUNK = 500;

// 셀 값 → 문자열(트림). 리치텍스트/하이퍼링크 객체도 처리.
function txt(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && v !== null && "text" in v) {
    return String((v as { text: unknown }).text).trim();
  }
  return String(v).trim();
}

async function main() {
  console.log(`엑셀 읽는 중: ${xlsxPath}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) {
    console.error(`"${SHEET}" 시트를 찾을 수 없습니다. 시트: ${wb.worksheets.map((w) => w.name).join(", ")}`);
    process.exit(1);
  }

  // plate 기준 중복 제거 (마지막 값 우선)
  const map = new Map<string, { plate: string; operator: string; route: string }>();
  let skipped = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const plate = txt(row.getCell("F").value);
    if (!plate) continue;
    const operator = txt(row.getCell("B").value);
    const route = txt(row.getCell("C").value);
    if (!operator || !route) {
      skipped++;
      continue; // 운수사/노선 빈칸 행은 제외 (vehicles는 not null)
    }
    map.set(plate, { plate, operator, route });
  }
  const records = [...map.values()];
  console.log(`적재 대상: ${records.length}대 (빈칸 제외 ${skipped}행)`);

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

  const { count } = await supabase.from("vehicles").select("*", { count: "exact", head: true });
  console.log(`✅ vehicles 총 ${count}대`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
