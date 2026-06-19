/**
 * 차량리스트.csv (CP949/EUC-KR) → Supabase vehicles 테이블 1회 적재.
 *
 * 사용법:
 *   1) .env (또는 .env.local) 에 아래 값 설정
 *        NEXT_PUBLIC_SUPABASE_URL=...
 *        SUPABASE_SERVICE_ROLE_KEY=...
 *   2) npm run import:vehicles
 *
 * 옵션:
 *   CSV 경로를 인자로 전달 가능. 미지정 시 프로젝트 루트의 "차량리스트.csv".
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

// .env.local 우선, 없으면 .env
loadEnv({ path: ".env.local" });
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 .env(.local)에 설정하세요.",
  );
  process.exit(1);
}

const csvPath = resolve(process.argv[2] ?? "차량리스트.csv");
const CHUNK = 500;

async function main() {
  console.log(`CSV 읽는 중: ${csvPath}`);
  const buf = readFileSync(csvPath);
  // CP949(=euc-kr 상위호환) 디코딩
  const text = iconv.decode(buf, "cp949");

  const rows: string[][] = parse(text, {
    skip_empty_lines: true,
    trim: true,
  });

  // 헤더 제거 (운수사, 노선, 차량번호)
  const header = rows[0];
  console.log("헤더:", header.join(" / "));
  const dataRows = rows.slice(1);

  // plate 기준 중복 제거 (마지막 값 우선)
  const map = new Map<string, { plate: string; operator: string; route: string }>();
  for (const r of dataRows) {
    const [operator, route, plate] = r.map((c) => (c ?? "").trim());
    if (!plate) continue;
    map.set(plate, { plate, operator, route });
  }
  const records = [...map.values()];
  console.log(`적재 대상: ${records.length} 행 (원본 ${dataRows.length} 행)`);

  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  let done = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("vehicles")
      .upsert(chunk, { onConflict: "plate" });
    if (error) {
      console.error(`업로드 실패 (offset ${i}):`, error.message);
      process.exit(1);
    }
    done += chunk.length;
    console.log(`  ${done}/${records.length} 완료`);
  }

  const { count, error: countErr } = await supabase
    .from("vehicles")
    .select("*", { count: "exact", head: true });
  if (countErr) {
    console.warn("카운트 확인 실패:", countErr.message);
  } else {
    console.log(`✅ vehicles 총 ${count} 행`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
