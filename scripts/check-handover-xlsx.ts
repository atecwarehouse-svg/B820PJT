// 양도양수·OS업데이트 로우데이터 파서 점검 — npx tsx scripts/check-handover-xlsx.ts "<노선별 차량현황.xlsx | OS적용리스트.xlsx>"
// 차량 수·영업소(운수사)별 대수·공동배차(노선 2개 이상) 차량·기종/시내·마을 구분 집계를 출력하고, 기본 정합성(중복 없음·필수값)을 assert 한다.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { busType, parseHandoverBuffer } from "../lib/import/parse-handover";

// busType 규칙 자체 점검(기종 없을 때 노선명 판정)
assert.equal(busType("서울마을버스(B710)", "5531번(군포공영차고지~노량진)"), "마을버스", "기종 우선");
assert.equal(busType("서울시내버스(B800)", "서초09(헌인가구단지~강남역)"), "시내버스", "기종 우선");
assert.equal(busType(undefined, "서울06출근(광주시능평동~강남역)"), "시내버스", "출근 노선");
assert.equal(busType(undefined, "8442출근(서초호반써밋아파트~양재역)"), "시내버스", "출근 노선(숫자)");
assert.equal(busType(undefined, "서초09(헌인가구단지~강남역)"), "마을버스", "지역명+숫자");
assert.equal(busType(undefined, "강남06-1(세곡리엔파크~수서역)"), "마을버스", "지역명+숫자-숫자");
assert.equal(busType(undefined, "N31강동 (강동공영차고지~국민대)"), "시내버스", "N 심야");
assert.equal(busType(undefined, "463(염곡동~국회의사당)"), "시내버스", "간선");
assert.equal(busType(undefined, "3313번(복정역~잠실새내역)"), "시내버스", "지선");

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("사용법: npx tsx scripts/check-handover-xlsx.ts <xlsx 경로>");
  const rows = await parseHandoverBuffer(readFileSync(path));
  assert.equal(new Set(rows.map((r) => r.plate)).size, rows.length, "차량번호 중복");
  for (const r of rows) assert.ok(r.plate && r.operator && r.route, `빈 값: ${JSON.stringify(r)}`);

  const byOffice = new Map<string, number>();
  for (const r of rows) byOffice.set(r.operator, (byOffice.get(r.operator) ?? 0) + 1);
  console.log(`차량 ${rows.length}대 · 영업소/운수사 ${byOffice.size}개`);
  for (const [o, n] of byOffice) console.log(`  ${o}: ${n}대`);
  const shared = rows.filter((r) => r.route.includes(" / "));
  console.log(`공동배차(노선 2개 이상) ${shared.length}대`);
  for (const r of shared) console.log(`  ${r.plate}: ${r.route}`);

  const withModel = rows.filter((r) => r.model).length;
  if (withModel) {
    const byModel = new Map<string, number>();
    const byType = new Map<string, number>();
    for (const r of rows) {
      byModel.set(r.model ?? "", (byModel.get(r.model ?? "") ?? 0) + 1);
      const t = busType(r.model, r.route);
      byType.set(t, (byType.get(t) ?? 0) + 1);
    }
    console.log(`기종 ${withModel}대`);
    for (const [m, n] of byModel) console.log(`  ${m}: ${n}대`);
    console.log(`구분: ${[...byType.entries()].map(([t, n]) => `${t} ${n}대`).join(" · ")}`);
    // 기종과 노선명 규칙이 어긋나는 차량(기종 없이 올렸을 때 달라질 차량) — 참고용
    const diff = rows.filter((r) => busType(r.model, r.route) !== busType(undefined, r.route));
    console.log(`기종≠노선명 규칙 ${diff.length}대${diff.length ? ": " + [...new Set(diff.map((r) => r.route))].slice(0, 10).join(", ") : ""}`);
  }
  console.log("OK");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
