/**
 * 차량 1대 완전 삭제 (CLI) — 관리자 삭제와 동일: Drive 사진 + photos/records + vehicles 행.
 * 잘못 추가된 테스트 차량 정리용.
 *
 * 사용법:
 *   npm run delete:vehicle -- "경기71사1234"
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { deletePhoto } from "../lib/gdrive";

loadEnv({ path: ".env.local" });
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const plate = process.argv[2]?.trim();
if (!plate) {
  console.error('사용법: npm run delete:vehicle -- "차량번호"');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  // 0) 존재 확인
  const { data: veh } = await sb.from("vehicles").select("plate, operator, route").eq("plate", plate).maybeSingle();
  const { count: photoCount } = await sb
    .from("photos")
    .select("plate", { count: "exact", head: true })
    .eq("plate", plate);
  console.log(`대상: ${plate} ${veh ? `(${veh.operator ?? ""} ${veh.route ?? ""})` : "(차량리스트에 없음)"} · 사진 ${photoCount ?? 0}장`);

  // 1) Drive 파일 삭제 — 이상유무 확인 사진(check_photos) 포함(테이블 없으면 무시)
  const { data: photos } = await sb.from("photos").select("storage_path").eq("plate", plate);
  const checkRes = await sb.from("check_photos").select("storage_path").eq("plate", plate);
  let driveDeleted = 0;
  for (const p of [...(photos ?? []), ...(checkRes.data ?? [])]) {
    if (p.storage_path) {
      await deletePhoto(p.storage_path).catch(() => {});
      driveDeleted++;
    }
  }

  // 2) DB 삭제 (사진 → 기록 → 차량)
  await sb.from("photos").delete().eq("plate", plate);
  if (!checkRes.error) {
    await sb.from("check_photos").delete().eq("plate", plate);
  }
  await sb.from("records").delete().eq("plate", plate);
  const del = await sb.from("vehicles").delete().eq("plate", plate);
  if (del.error) {
    console.error("차량 삭제 실패:", del.error.message);
    process.exit(1);
  }

  const { count } = await sb.from("vehicles").select("*", { count: "exact", head: true });
  console.log(`✅ ${plate} 삭제 완료 (Drive 사진 ${driveDeleted}장 제거) · 현재 차량 ${count}대`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
