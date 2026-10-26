// 양도양수 로우데이터(노선별 차량현황 xlsx) 파서.
//   첫 시트, 1~10행 중 "차량번호"가 있는 행을 머리글로 삼고 열은 머리글 이름으로 찾는다
//   (예: 교통사업자ID·교통사업자명·버스영업소명·버스노선ID·표준노선ID·버스노선명·차량ID·표준차량ID·차량번호·교통수단·공동배차).
//   차량번호 기준 1대 1행 — 공동배차로 여러 노선에 나오는 차량은 노선을 " / "로 이어 한 행으로 합친다(단말기는 차량에 하나).
//   OS업데이트 적용리스트(센터·차량(번호/운영수량)·기종·운수사·노선·완료여부·완료일·특이사항)도 같은 파서 —
//   영업소 자리에 '운수사', 선택 열 '기종'(model)·'센터'(center, 차량별 담당 센터).
import ExcelJS from "exceljs";

export interface HandoverRow {
  plate: string;
  operator: string; // 영업소명(OS업데이트는 운수사)
  route: string;
  model?: string; // 기종 열(있을 때만)
  center?: string; // 센터 열(있을 때만)
}

export type BusType = "시내버스" | "마을버스";
/** OS업데이트 대상 아님 — 기종이 공항버스(B620)인 차량은 업로드에서 제외한다(사용자 결정 10/26) */
export const isExcludedModel = (model: string | undefined) => (model ?? "").includes("공항");
/** 시내/마을버스 판정 — 기종 열에 '마을'/'시내'가 있으면 그것, 없으면 노선명 규칙:
 *  출근·퇴근 노선 = 시내, 지역명+숫자(서초09·강남06-1) = 마을, 그 외(숫자·N 노선 = 지선/간선) = 시내.
 *  ponytail: 노선명 휴리스틱 — 기종 없는 파일에서 '서울06출근' 같은 광역 출퇴근은 출근/퇴근 글자로만 구분한다. 틀리면 기종 열을 채워 올리는 게 정답. */
export function busType(model: string | undefined, route: string): BusType {
  const m = model ?? "";
  if (m.includes("마을")) return "마을버스";
  if (m.includes("시내")) return "시내버스";
  const first = route.split(" / ")[0].trim();
  if (/출근|퇴근/.test(first)) return "시내버스";
  return /^[가-힣]+\s?\d/.test(first) ? "마을버스" : "시내버스";
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
  let col = { plate: 0, office: 0, route: 0, model: 0, center: 0 };
  for (let r = 1; r <= Math.min(HEADER_SCAN_ROWS, ws.rowCount) && !headerRow; r++) {
    const row = ws.getRow(r);
    const found = { plate: 0, office: 0, route: 0, model: 0, center: 0 };
    row.eachCell({ includeEmpty: false }, (c, n) => {
      const h = norm(cellText(c));
      if (!h) return;
      // 차량번호 · 차량(번호/운영수량) 둘 다
      if (!found.plate && (h.includes("차량번호") || /^차량\(/.test(h))) found.plate = n;
      else if (!found.office && /영업소|운수사/.test(h) && !h.includes("id")) found.office = n;
      else if (!found.route && /노선명|^노선$/.test(h) && !h.includes("id")) found.route = n;
      else if (!found.model && h === "기종") found.model = n;
      else if (!found.center && h === "센터") found.center = n;
    });
    if (found.plate) {
      headerRow = r;
      col = found;
    }
  }
  if (!headerRow) throw new Error("머리글에 '차량번호' 열이 없습니다. 1행에 버스영업소명·버스노선명·차량번호가 있는 로우데이터인지 확인하세요.");
  if (!col.office || !col.route) {
    throw new Error(`머리글에 ${!col.office ? "'버스영업소명'(또는 '운수사')" : "'버스노선명'(또는 '노선')"} 열이 없습니다.`);
  }

  const byPlate = new Map<string, { operator: string; routes: string[]; model?: string; center?: string }>();
  const opt = (row: ExcelJS.Row, n: number) => (n ? cellText(row.getCell(n)).trim() || undefined : undefined);
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const plate = cellText(row.getCell(col.plate)).replace(/\s+/g, "");
    const operator = cellText(row.getCell(col.office)).trim();
    const route = cellText(row.getCell(col.route)).trim();
    if (!plate || !operator || !route) continue;
    const cur = byPlate.get(plate);
    if (!cur) byPlate.set(plate, { operator, routes: [route], model: opt(row, col.model), center: opt(row, col.center) });
    else if (!cur.routes.includes(route)) cur.routes.push(route);
  }
  if (!byPlate.size) throw new Error("차량 행이 없습니다(차량번호·영업소·노선이 모두 있는 행 0개).");
  return [...byPlate.entries()].map(([plate, v]) => ({
    plate,
    operator: v.operator,
    route: v.routes.join(" / "),
    ...(v.model ? { model: v.model } : {}),
    ...(v.center ? { center: v.center } : {}),
  }));
}
