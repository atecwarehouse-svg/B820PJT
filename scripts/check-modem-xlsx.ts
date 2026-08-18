/**
 * 모뎀 사용내역 엑셀 자체 점검 — DB 없이 실행 가능.
 *   npx tsx scripts/check-modem-xlsx.ts
 * 과거 내역 아래에 DB 기록이 날짜순으로 붙는지, J열 카운트 함수가 살아 있는지 확인한다.
 */
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { mergeModemRows, renderModemXlsx, type SavedModem } from "../lib/export/build-modem-xlsx";
import history from "../lib/export/modem-history.json";

const saved: SavedModem[] = [
  {
    date: "2026-08-19",
    operator: "영종운수",
    plate: "인천72바1350",
    kind: "현장교체",
    symptom: "LTE통신불량(적색)",
    before_sn: "1046100",
    after_sn: "1057300",
    photo_after: "drive-id-1",
    photo_info: null,
  },
  {
    // 과거 내역과 같은 (날짜·차량) — 덮어써야 한다(행이 늘면 안 됨)
    date: "2026-08-18",
    operator: "영종운수",
    plate: "인천72바1342",
    kind: "예비품불량",
    symptom: null,
    before_sn: null,
    after_sn: "1057259",
    photo_after: null,
    photo_info: null,
  },
];

const rows = mergeModemRows(saved);
assert.equal(rows.length, history.length + 1, "새 기록 1건만 늘어야 한다");
assert.deepEqual(
  [...rows].map((r) => r.date),
  [...rows].map((r) => r.date).sort(),
  "날짜 오름차순 정렬",
);
assert.equal(rows[rows.length - 1].plate, "72-1350", "차량번호는 양식 표기(72-1350)");
assert.equal(rows[rows.length - 1].photo, "O", "사진 있으면 O");
const dup = rows.find((r) => r.date === "2026-08-18" && r.plate === "72-1342")!;
assert.equal(dup.kind, "예비품불량", "같은 날짜·차량은 앱 기록으로 덮어쓴다");
assert.equal(dup.photo, "X", "사진 없으면 X");

main();

async function main() {
const { buffer, filename } = await renderModemXlsx(rows);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buffer as unknown as ArrayBuffer);
const ws = wb.worksheets[0];
assert.equal(ws.getCell("J1").formula, "COUNTIF(H:H,I1)", "J1 카운트 함수 유지");
assert.equal(ws.getCell("J2").formula, "COUNTIF(H:H,I2)", "J2 카운트 함수 유지");
assert.equal(ws.getCell("I3").value, "예비품불량", "예비품불량 카운트 줄");
assert.equal(ws.getCell("J3").formula, "COUNTIF(H:H,I3)", "J3 예비품불량 카운트");
assert.equal(ws.getCell("J4").formula, "SUM(J1:J3)", "J4 합계 = 3종 합");
assert.equal(ws.getCell("I5").value, "※교체일자 = 설치일 기준", "안내는 I5:J5");
assert.equal(ws.getCell("A5").value, "교체일자");
assert.equal(ws.getCell("H5").value, "사용내역");
assert.equal(ws.actualRowCount, 5 + rows.length, "머리글 5줄 + 데이터");
// ExcelJS는 calcPr을 다시 읽지 않으므로 저장된 XML을 직접 확인한다
const zip = await JSZip.loadAsync(buffer);
const wbXml = await zip.file("xl/workbook.xml")!.async("string");
assert.match(wbXml, /fullCalcOnLoad="1"/, "열 때 재계산(fullCalcOnLoad)");

console.log(`OK — ${rows.length}행, ${filename} (${buffer.length} bytes)`);
}
