// 양도양수 로우데이터(노선별 차량현황 xlsx) 파서.
//   첫 시트, 1~10행 중 "차량번호"가 있는 행을 머리글로 삼고 열은 머리글 이름으로 찾는다
//   (예: 교통사업자ID·교통사업자명·버스영업소명·버스노선ID·표준노선ID·버스노선명·차량ID·표준차량ID·차량번호·교통수단·공동배차).
//   차량번호 기준 1대 1행 — 공동배차로 여러 노선에 나오는 차량은 노선을 " / "로 이어 한 행으로 합친다(단말기는 차량에 하나).
import ExcelJS from "exceljs";

export interface HandoverRow {
  plate: string;
  operator: string; // 영업소명
  route: string;
}

const HEADER_SCAN_ROWS = 10;
const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, "").toLowerCase();

function cellText(c: ExcelJS.Cell): string {
  const v = c.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return String(v.result ?? "");
    if ("text" in v) return String(v.text ?? "");
  }
  return String(v);
}

export async function parseHandoverBuffer(buffer: Buffer): Promise<HandoverRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("엑셀에 시트가 없습니다.");

  // 머리글 행 찾기
  let headerRow = 0;
  let col = { plate: 0, office: 0, route: 0 };
  for (let r = 1; r <= Math.min(HEADER_SCAN_ROWS, ws.rowCount) && !headerRow; r++) {
    const row = ws.getRow(r);
    const found = { plate: 0, office: 0, route: 0 };
    row.eachCell({ includeEmpty: false }, (c, n) => {
      const h = norm(cellText(c));
      if (!h) return;
      if (!found.plate && h.includes("차량번호")) found.plate = n;
      else if (!found.office && h.includes("영업소")) found.office = n;
      else if (!found.route && /노선명|^노선$/.test(h) && !h.includes("id")) found.route = n;
    });
    if (found.plate) {
      headerRow = r;
      col = found;
    }
  }
  if (!headerRow) throw new Error("머리글에 '차량번호' 열이 없습니다. 1행에 버스영업소명·버스노선명·차량번호가 있는 로우데이터인지 확인하세요.");
  if (!col.office || !col.route) {
    throw new Error(`머리글에 ${!col.office ? "'버스영업소명'" : "'버스노선명'"} 열이 없습니다.`);
  }

  const byPlate = new Map<string, { operator: string; routes: string[] }>();
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const plate = cellText(row.getCell(col.plate)).replace(/\s+/g, "");
    const operator = cellText(row.getCell(col.office)).trim();
    const route = cellText(row.getCell(col.route)).trim();
    if (!plate || !operator || !route) continue;
    const cur = byPlate.get(plate);
    if (!cur) byPlate.set(plate, { operator, routes: [route] });
    else if (!cur.routes.includes(route)) cur.routes.push(route);
  }
  if (!byPlate.size) throw new Error("차량 행이 없습니다(차량번호·영업소·노선이 모두 있는 행 0개).");
  return [...byPlate.entries()].map(([plate, v]) => ({ plate, operator: v.operator, route: v.routes.join(" / ") }));
}
