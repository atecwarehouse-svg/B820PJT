/**
 * 안전관리 서약서 종료시간 정리 — 작업 종료(설치일 다음날 05:30) 이후에 '설치 종료'를
 * 누른 세션의 end_time을 05:30으로 바꾼다. (ended_at 원본 기록은 그대로 둔다)
 *
 * 사용법: npx tsx scripts/fix-pledge-end-time.ts        (변경 목록만 출력)
 *         npx tsx scripts/fix-pledge-end-time.ts --apply (실제 반영)
 */

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

const apply = process.argv.includes("--apply");
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await sb
    .from("pledge_sessions")
    .select("id, operator, install_date, end_time, ended_at")
    .not("ended_at", "is", null)
    .order("install_date");
  if (error) throw error;

  let n = 0;
  for (const s of data ?? []) {
    const limit = Date.parse(`${s.install_date}T20:30:00Z`); // 설치일 다음날 05:30 KST
    if (!Number.isFinite(limit) || Date.parse(s.ended_at) <= limit) continue;
    if (s.end_time === "05:30") continue;
    n++;
    console.log(`${s.install_date} ${s.operator ?? ""} : ${s.end_time} → 05:30`);
    if (apply) {
      const { error: e } = await sb
        .from("pledge_sessions")
        .update({ end_time: "05:30" })
        .eq("id", s.id);
      if (e) console.error("  실패:", e.message);
    }
  }
  console.log(`${apply ? "변경" : "변경 대상"} ${n}건`);
}

main();
