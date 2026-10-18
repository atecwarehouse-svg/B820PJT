// 차량단말기버전 파일 파서 점검 — npx tsx scripts/check-terminal-xls.ts "<차량단말기버전-YYYYMMDD.xls>"
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { checkTerminal, parseTerminalBuffer } from "../lib/import/parse-terminal-xls";

const path = process.argv[2];
if (!path) throw new Error("사용법: npx tsx scripts/check-terminal-xls.ts <xls 경로>");
const rows = parseTerminalBuffer(readFileSync(path));
assert.ok(rows.length > 0, "차량 없음");
const bad = rows.filter((r) => !checkTerminal(r.ids).ok);
console.log(`차량 ${rows.length}대 · 단말기 5종 충족 ${rows.length - bad.length}대 · 미충족 ${bad.length}대`);
for (const r of bad) console.log(`  ${r.plate}: ${checkTerminal(r.ids).missing} (${r.ids.join(",")})`);
assert.deepEqual(checkTerminal(["550001", "560001", "156001", "156002", "156003"]), { ok: true, counts: [1, 1, 3], missing: "" });
assert.equal(checkTerminal(["550001", "156001"]).missing, "56000… 0/1, 1560… 1/3");
console.log("OK");
