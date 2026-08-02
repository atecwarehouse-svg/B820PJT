// 설치팀별 확인 '메일로 받기' 첨부 엑셀 — [팀별 요약]·[차량 목록] 2시트, 표 서식 포함.
import ExcelJS from "exceljs";

export interface CaptureRow {
  team?: string;
  operator?: string;
  route?: string;
  plate?: string;
  date?: string;
}

const THIN = { style: "thin" as const, color: { argb: "FFB0B7C3" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0369A1" }, // 앱과 같은 sky 톤
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE0F2FE" },
};
const ZEBRA_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F7FB" },
};
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } };
const CENTER = { vertical: "middle" as const, horizontal: "center" as const };

function styleHeader(row: ExcelJS.Row, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = CENTER;
    cell.border = BORDER;
  }
  row.height = 20;
}

export async function buildCaptureXlsx(
  rows: CaptureRow[],
  label: string,
  dateStr: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  // [팀별 요약] — 제목·검색 조건·팀별 대수·합계
  const sum = wb.addWorksheet("팀별 요약");
  sum.getColumn(1).width = 24;
  sum.getColumn(2).width = 12;
  sum.mergeCells("A1:B1");
  const title = sum.getCell("A1");
  title.value = "설치팀별 설치 현황";
  title.font = { bold: true, size: 14, color: { argb: "FF0C4A6E" } };
  title.alignment = CENTER;
  sum.getRow(1).height = 26;
  sum.mergeCells("A2:B2");
  const sub = sum.getCell("A2");
  sub.value = `검색 조건: ${label || "전체"} · ${dateStr} 기준`;
  sub.font = { size: 10, color: { argb: "FF6B7280" } };
  sub.alignment = CENTER;

  const header = sum.getRow(4);
  header.values = ["설치팀", "대수"];
  styleHeader(header, 2);

  const byTeam = new Map<string, number>();
  for (const r of rows) byTeam.set(r.team ?? "", (byTeam.get(r.team ?? "") ?? 0) + 1);
  const teamEntries = [...byTeam.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko"));
  teamEntries.forEach(([t, c], i) => {
    const row = sum.getRow(5 + i);
    row.values = [t, c];
    for (let col = 1; col <= 2; col++) {
      const cell = row.getCell(col);
      cell.border = BORDER;
      if (i % 2 === 1) cell.fill = ZEBRA_FILL;
    }
    row.getCell(2).alignment = CENTER;
  });
  const totalRow = sum.getRow(5 + teamEntries.length);
  totalRow.values = ["합계", rows.length];
  for (let col = 1; col <= 2; col++) {
    const cell = totalRow.getCell(col);
    cell.fill = TOTAL_FILL;
    cell.font = { bold: true, color: { argb: "FF0C4A6E" } };
    cell.border = BORDER;
  }
  totalRow.getCell(2).alignment = CENTER;

  // [차량 목록] — 머리글 고정·자동필터·줄무늬
  const ws = wb.addWorksheet("차량 목록", { views: [{ state: "frozen", ySplit: 1 }] });
  [24, 22, 12, 18, 13].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const h = ws.getRow(1);
  h.values = ["설치팀", "운수사", "노선", "차량번호", "설치일"];
  styleHeader(h, 5);
  ws.autoFilter = "A1:E1";
  rows.forEach((r, i) => {
    const row = ws.getRow(i + 2);
    row.values = [r.team ?? "", r.operator ?? "", r.route ?? "", r.plate ?? "", r.date ?? ""];
    for (let col = 1; col <= 5; col++) {
      const cell = row.getCell(col);
      cell.border = BORDER;
      if (col >= 3) cell.alignment = CENTER;
      if (i % 2 === 1) cell.fill = ZEBRA_FILL;
    }
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
