/**
 * 수량 차감 방식(quota_mode) 켜기 전에 이미 완료된 차량의 예정일 보정 (CLI).
 * 완료(records.saved_at) 순서대로 settleQuota(plate, 완료 업무일)을 적용해
 * 완료 차량은 실제 완료일로, 그날 미착수 차량은 자리를 바꾸거나 다음 예정일로 이월한다.
 *
 * 사용법:
 *   npm run quota:backfill -- <프로젝트 slug>            # 변경안만 출력(쓰기 없음)
 *   npm run quota:backfill -- <프로젝트 slug> --apply    # 실제 반영
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { settleQuota, type Move } from "../lib/quota";
import { workDateString } from "../lib/work-day";

loadEnv({ path: ".env.local" });
loadEnv();

const slug = process.argv[2]?.trim();
const apply = process.argv.includes("--apply");
if (!slug) {
  console.error("사용법: npm run quota:backfill -- <slug> [--apply]");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
// B820은 public 스키마, 그 외는 slug 스키마 (lib/project.ts schemaOf와 동일 규칙)
const schema = slug === "b820" ? "public" : slug;
const sb = createClient(url, key, { db: { schema }, auth: { persistSession: false } });

async function main() {
  const { data: recs, error } = await sb
    .from("records")
    .select("plate, saved_at")
    .not("saved_at", "is", null)
    .order("saved_at");
  if (error) throw new Error(error.message);
  console.log(`[${slug}] 완료 차량 ${recs?.length ?? 0}대 · ${apply ? "실제 반영" : "변경안만(dry-run)"}`);
  const all: Move[] = [];
  for (const r of (recs ?? []) as { plate: string; saved_at: string }[]) {
    const day = workDateString(r.saved_at);
    // dry-run은 이전 이동이 반영되지 않은 상태에서 계산하므로 참고용(겹치는 교환은 실제 반영 때 자연히 정리됨)
    const moves = await settleQuota(sb as never, r.plate, day, { dryRun: !apply });
    for (const m of moves) {
      all.push(m);
      console.log(`  ${m.plate}: ${m.from ?? "없음"} → ${m.to}${m.plate === r.plate ? " (완료 " + day + ")" : ""}`);
    }
  }
  console.log(`총 ${all.length}건 ${apply ? "반영됨" : "(미반영)"}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
