// 양도양수 로우데이터 파서 점검 — npx tsx scripts/check-handover-xlsx.ts "<노선별 차량현황.xlsx>"
// 차량 수·영업소별 대수·공동배차(노선 2개 이상) 차량을 출력하고, 기본 정합성(중복 없음·필수값)을 assert 한다.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { parseHandoverBuffer } from "../lib/import/parse-handover";

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("사용법: npx tsx scripts/check-handover-xlsx.ts <xlsx 경로>");
  const rows = await parseHandoverBuffer(readFileSync(path));
  assert.equal(new Set(rows.map((r) => r.plate)).size, rows.length, "차량번호 중복");
  for (const r of rows) assert.ok(r.plate && r.operator && r.route, `빈 값: ${JSON.stringify(r)}`);

  const byOffice = new Map<string, number>();
  for (const r of rows) byOffice.set(r.operator, (byOffice.get(r.operator) ?? 0) + 1);
  console.log(`차량 ${rows.length}대`);
  for (const [o, n] of byOffice) console.log(`  ${o}: ${n}대`);
  const shared = rows.filter((r) => r.route.includes(" / "));
  console.log(`공동배차(노선 2개 이상) ${shared.length}대`);
  for (const r of shared) console.log(`  ${r.plate}: ${r.route}`);
  console.log("OK");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
