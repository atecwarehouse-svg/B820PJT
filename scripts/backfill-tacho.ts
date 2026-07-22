/**
 * 타코 제조사(vehicles.tacho) 백필 — 저장소의 최신 진행현황 템플릿에서 U열을 읽어 반영.
 *
 * 일정 업로드를 다시 하지 않아도, 이미 업로드된 템플릿(templates/progress-template.xlsx)
 * 기준으로 기존 차량의 타코 제조사를 채운다. migration_tacho.sql 실행 후 1회 실행.
 *
 * 사용법: npm run backfill:tacho
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { parseScheduleBuffer } from "../lib/import/parse-schedule";

loadEnv({ path: ".env.local" });
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const TEMPLATE_BUCKET = process.env.TEMPLATE_BUCKET ?? "templates";
const TEMPLATE_OBJECT = process.env.TEMPLATE_OBJECT ?? "progress-template.xlsx";
const CHUNK = 500;
const PAGE = 1000;

async function main() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  console.log(`템플릿 다운로드: ${TEMPLATE_BUCKET}/${TEMPLATE_OBJECT}`);
  const { data: file, error: dlError } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .download(TEMPLATE_OBJECT);
  if (dlError || !file) {
    console.error("템플릿 다운로드 실패:", dlError?.message);
    process.exit(1);
  }
  const { rows } = await parseScheduleBuffer(Buffer.from(await file.arrayBuffer()));
  const withTacho = rows.filter((r) => r.tacho);
  console.log(`엑셀 차량 ${rows.length}대 · 타코 제조사 있는 차량 ${withTacho.length}대`);

  // DB에 있는 차량만 갱신 (없는 plate가 섞이면 not-null 컬럼 때문에 insert 실패)
  const existing = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("plate")
      .order("plate")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("차량 조회 실패:", error.message);
      process.exit(1);
    }
    for (const v of data ?? []) existing.add(v.plate);
    if (!data || data.length < PAGE) break;
  }
  const targets = withTacho
    .filter((r) => existing.has(r.plate))
    .map((r) => ({ plate: r.plate, tacho: r.tacho }));
  console.log(`갱신 대상(DB 존재): ${targets.length}대`);

  let done = 0;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    const { error } = await supabase.from("vehicles").upsert(chunk, { onConflict: "plate" });
    if (error) {
      console.error(`갱신 실패 (offset ${i}):`, error.message);
      if (/tacho/i.test(error.message)) {
        console.error("→ migration_tacho.sql을 Supabase SQL Editor에서 먼저 실행해주세요.");
      }
      process.exit(1);
    }
    done += chunk.length;
    console.log(`  ${done}/${targets.length} 완료`);
  }

  const { count } = await supabase
    .from("vehicles")
    .select("*", { count: "exact", head: true })
    .ilike("tacho", "%DT-202%");
  console.log(`✅ 백필 완료 — 조영 DT-202 차량 ${count}대`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
