import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/import/schedule/template → 로우데이터 빈 양식(xlsx) 다운로드.
// 「차량리스트」 시트에 제목줄만 있고, 열 위치는 lib/import/parse-schedule.ts 가 읽는 자리와 같다.
// 「작성 예시」 시트는 참고용(파서가 읽지 않음). 전개일정·진행현황 시트는 없으므로 차량 리스트만 등록된다.
const HEADERS: Record<string, string> = {
  A: "번호",
  B: "운수사",
  C: "노선",
  D: "",
  E: "야간 박차지 주소",
  F: "차량번호",
  G: "",
  H: "",
  I: "설치 예정일",
  J: "연식",
  K: "",
  L: "모델명",
  U: "타코 제조사",
};

export async function GET() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("차량리스트");
  for (const [col, name] of Object.entries(HEADERS)) {
    const cell = ws.getCell(`${col}1`);
    cell.value = name;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.alignment = { horizontal: "center" };
  }
  ws.getColumn("B").width = 16;
  ws.getColumn("C").width = 12;
  ws.getColumn("E").width = 34;
  ws.getColumn("F").width = 16;
  ws.getColumn("I").width = 14;
  ws.getColumn("L").width = 18;
  ws.getColumn("U").width = 14;
  ws.getColumn("I").numFmt = "yyyy-mm-dd";
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const ex = wb.addWorksheet("작성 예시");
  ex.addRow(["이 시트는 참고용입니다. 「차량리스트」 시트에만 입력하세요. 1행은 제목줄, 2행부터 차량 한 대가 한 줄입니다."]);
  ex.addRow([]);
  ex.addRow(["열", "내용", "구분", "예시"]);
  const rows: [string, string, string, string][] = [
    ["A", "번호", "선택", "1"],
    ["B", "운수사", "필수", "○○교통"],
    ["C", "노선", "필수", "5311"],
    ["E", "야간 박차지 주소", "권장 (운수사별 첫 행만)", "인천 서구 ○○동 123"],
    ["F", "차량번호", "필수", "인천70바4005"],
    ["I", "설치 예정일", "권장", "2026-10-15"],
    ["J", "연식", "선택", "2023"],
    ["L", "모델명", "선택", "유니버스 수소"],
    ["U", "타코 제조사", "선택", "○○전자"],
  ];
  rows.forEach((r) => ex.addRow(r));
  ex.getRow(3).font = { bold: true };
  ex.getColumn(1).width = 6;
  ex.getColumn(2).width = 18;
  ex.getColumn(3).width = 24;
  ex.getColumn(4).width = 24;

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const filename = "차량리스트_빈양식.xlsx";
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="raw_template.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
