/**
 * 진행현황 양식 템플릿 → Supabase Storage 비공개 버킷 업로드.
 *
 * 템플릿은 차량리스트 전체(개인정보)를 담고 있어 공개 GitHub 저장소에 두지 않고
 * Supabase 비공개 버킷에 보관한다. 다운로드 라우트가 service_role 키로 내려받는다.
 *
 * 사용법:
 *   npm run upload:template -- "C:/경로/인천버스_설치_전개현황_YYMMDD.xlsx"
 *   (경로 생략 시 lib/export/templates/진행현황_template.xlsx 사용)
 *
 * 양식이 갱신되면 이 스크립트만 다시 돌리면 된다(같은 경로로 덮어쓰기).
 */

import { resolve } from "node:path";
import { readFileSync } from "node:fs";
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

const BUCKET = process.env.TEMPLATE_BUCKET ?? "templates";
const OBJECT = process.env.TEMPLATE_OBJECT ?? "progress-template.xlsx";
const localPath = resolve(
  process.argv[2] ?? "lib/export/templates/진행현황_template.xlsx",
);

async function main() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // 비공개 버킷 보장 (없으면 생성)
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (error) {
      console.error("버킷 생성 실패:", error.message);
      process.exit(1);
    }
    console.log(`비공개 버킷 생성: ${BUCKET}`);
  }

  console.log(`업로드 중: ${localPath} → ${BUCKET}/${OBJECT}`);
  const body = readFileSync(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(OBJECT, body, {
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: true,
  });
  if (error) {
    console.error("업로드 실패:", error.message);
    process.exit(1);
  }
  console.log(`✅ 업로드 완료 (${(body.length / 1024).toFixed(0)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
