// 노선별 배차표 파서 점검 — npx tsx scripts/check-route-dispatch.ts "<배차표.xlsx>" [회사명=공항리무진]
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { parseRouteDispatch } from "../lib/import/parse-route-dispatch";
import { dayTypeOf, plateOf, WINDOW_FROM, WINDOW_TO } from "../lib/route-dispatch";

assert.equal(dayTypeOf("2026-11-13"), "평일"); // 금
assert.equal(dayTypeOf("2026-11-14"), "토·휴일"); // 토
assert.equal(dayTypeOf("2026-11-15"), "토·휴일"); // 일
assert.equal(dayTypeOf("2026-12-25"), "토·휴일"); // 금요일 성탄절

assert.equal(plateOf("공항리무진", 18), "서울75사1118");
assert.equal(plateOf("공항리무진", 84), "서울71사2284");
assert.equal(plateOf("공항리무진", 310), "서울71사2310");
assert.equal(plateOf("공항리무진", 121), "서울70사8121");
assert.equal(plateOf("공항리무진", 500), "");
assert.equal(plateOf("한국공항리무진", 121), ""); // 회사가 다르면 규칙 없음

const path = process.argv[2];
if (path) {
  const company = process.argv[3] ?? "공항리무진";
  const { date, blocks } = parseRouteDispatch(readFileSync(path), company);
  console.log(`날짜 ${date} · 블록 ${blocks.length}개`);
  for (const b of blocks) {
    console.log(`\n[${b.day}] ${b.route} — ${b.rows.length}대`);
    for (const r of b.rows) {
      assert.ok(r.time >= WINDOW_FROM && r.time < WINDOW_TO, `${r.no} 시간 범위 밖: ${r.time}`);
      console.log(`  ${r.time} ${String(r.no).padStart(3)} ${r.plate || "(규칙없음)"} | ${r.from}${r.note ? " | " + r.note : ""}`);
    }
  }
  console.log("\nPLATES=" + JSON.stringify([...new Set(blocks.flatMap((b) => b.rows.map((r) => r.plate)).filter(Boolean))]));
}
console.log("OK");
