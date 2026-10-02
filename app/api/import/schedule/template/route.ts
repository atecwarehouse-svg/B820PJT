import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/import/schedule/template → 로우데이터 빈 양식(xlsx) 다운로드.
// 「차량리스트」 시트: 1행 제목줄 + 2행 작성 예시(차량번호가 "예)"로 시작해 파서가 건너뜀 — 지우지 않고 올려도 등록 안 됨).
// 열 위치는 lib/import/parse-schedule.ts 가 읽는 자리와 같다. 전개일정·진행현황 시트는 없으므로 차량 리스트만 등록된다.
const HEADERS: Record<string, string> = {
  A: "번호",
  B: "운수사",
  C: "노선",
  D: "차고지",
  E: "설치 장소",
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

  // 2행 작성 예시 — 회색 글씨. 차량번호가 "예)"로 시작하면 업로드 시 건너뛴다.
  const EXAMPLE: Record<string, string | Date> = {
    A: "1",
    B: "○○교통",
    C: "5311",
    D: "○○차고지",
    E: "인천 서구 ○○동 123",
    F: "예) 인천70바4005",
    I: new Date(Date.UTC(2026, 9, 15)),
    J: "2023",
    L: "유니버스 수소",
    U: "○○전자",
  };
  for (const [col, v] of Object.entries(EXAMPLE)) {
    const cell = ws.getCell(`${col}2`);
    cell.value = v;
    cell.font = { color: { argb: "FF9CA3AF" }, italic: true };
  }
  ws.getColumn("D").width = 14;

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
