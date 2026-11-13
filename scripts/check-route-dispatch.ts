// 노선별 배차표 파서 점검 — npx tsx scripts/check-route-dispatch.ts "<배차표.xlsx>" [회사명=공항리무진]
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { parseRouteDispatch } from "../lib/import/parse-route-dispatch";
import { addMinutes, dayTypeOf, plateOf, routeChanges, WINDOW_FROM, WINDOW_TO } from "../lib/route-dispatch";

assert.equal(addMinutes("21:30", 120), "23:30");
assert.equal(addMinutes("23:04", 120), "01:04"); // 자정 넘김

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

// 노선명 갱신 — 번호로 맞춰 기존 표기 유지, 같은 노선이면 변경 없음, 기존에 없는 번호·엑셀에 없는 차량은 그대로
assert.deepEqual(
  routeChanges(
    [
      { plate: "A", route: "6015번(명동)" },
      { plate: "B", route: "6018(목동)" },
      { plate: "C", route: "N6000번(고속터미널)" },
      { plate: "D", route: "6018(목동)" },
    ],
    { A: "6015 (명동)", B: "6015 (명동)", C: "6000 (잠실)", D: "6018 (신도림)" },
  ),
  [{ plate: "B", route: "6015번(명동)" }],
);

const path = process.argv[2];
if (path) {
  const company = process.argv[3] ?? "공항리무진";
  const { date, blocks, plateRoutes, plateLastT1 } = parseRouteDispatch(readFileSync(path), company);
  console.log("마지막 T1:", JSON.stringify(Object.fromEntries(Object.entries(plateLastT1).map(([d, m]) => [d, Object.entries(m).slice(0, 12)]))));
  console.log("마지막 T1 대수:", Object.entries(plateLastT1).map(([d, m]) => `${d} ${Object.keys(m).length}`).join(" · "));
  console.log("노선 파악 차량:", Object.entries(plateRoutes).map(([d, m]) => `${d} ${Object.keys(m).length}대`).join(" · "));
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
