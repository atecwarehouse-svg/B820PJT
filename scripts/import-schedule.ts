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
 * 파싱 로직은 lib/import/parse-schedule.ts 와 공용(웹 업로드 /api/import/schedule 동일).
 */

import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { parseScheduleFile } from "../lib/import/parse-schedule";

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
const CHUNK = 500;

async function main() {
  console.log(`엑셀 읽는 중: ${xlsxPath}`);
  const { rows, pilotCount, skipped } = await parseScheduleFile(xlsxPath);
  console.log(
    `적재 대상: ${rows.length}대 (빈칸 제외 ${skipped}행) · 시범설치 차량 ${pilotCount}대`,
  );

  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from("vehicles").upsert(chunk, { onConflict: "plate" });
    if (error) {
      console.error(`업로드 실패 (offset ${i}):`, error.message);
      process.exit(1);
    }
    done += chunk.length;
    console.log(`  ${done}/${rows.length} 완료`);
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
