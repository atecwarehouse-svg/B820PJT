// AI텔레콤 'LTE모뎀 사용 현황' 양식 생성 — 과거 내역(modem-history.json, 2026-08-18까지
// 받아둔 원본 36행) 아래에 DB(modem_defects) 기록을 날짜순으로 이어 붙인다.
//
// J열 카운트는 값이 아니라 함수 그대로 넣는다(COUNTIF/SUM) — 엑셀에서 행을 더 추가해도
// 계속 맞는다. 양식 상단(I1:J4)은 원본과 같은 구성으로 유지한다.

import ExcelJS from "exceljs";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { shortPlate } from "@/lib/modem";
import { kstStamp } from "./filename";
import history from "./modem-history.json";

export interface SavedModem {
  date: string;
  operator: string;
  plate: string; // DB 표기(인천70바4652)
  kind: string;
  symptom: string | null;
  before_sn: string | null;
  after_sn: string | null;
  photo_after: string | null;
  photo_info: string | null;
}

export interface Row {
  date: string; // YYYY-MM-DD
  operator: string;
  plate: string; // 양식 표기(70-4652)
  before: string;
  after: string;
  symptom: string;
  photo: string; // O | X
  kind: string;
}

const FONT = { name: "맑은 고딕", size: 11 } as const;
const THIN = { style: "thin" as const };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const CENTER = { horizontal: "center" as const, vertical: "middle" as const };
const HEADERS = [
  "교체일자",
  "운수사명",
  "차량번호",
  "교체 전 LTE S/N",
  "교체 후 LTE S/N",
  "증상",
  "사진 유무",
  "사용내역",
];
const WIDTHS = [11.5, 13, 13.25, 20.375, 20.375, 35.375, 13.875, 13.25, 13.75, 10];

export async function buildModemXlsx(): Promise<{ buffer: Buffer; filename: string }> {
  const supabase = createServiceClient();
  const saved = await fetchAll<SavedModem>((from, to) =>
    supabase
      .from("modem_defects")
      .select("date, operator, plate, kind, symptom, before_sn, after_sn, photo_after, photo_info")
      .order("date")
      .order("plate")
      .range(from, to),
  ).catch((e) => {
    throw new Error(
      /modem_defects/i.test(String(e?.message ?? e))
        ? "DB 준비가 안 됐습니다. supabase/migration_modem_defects.sql을 실행해주세요."
        : String(e?.message ?? e),
    );
  });

  return renderModemXlsx(mergeModemRows(saved));
}

// 과거 내역 + DB 기록 → 날짜순 한 벌. 같은 (날짜·차량)은 앱 기록이 최신이므로 덮어쓴다.
export function mergeModemRows(saved: SavedModem[]): Row[] {
  const rows: Row[] = (history as Row[]).map((h) => ({ ...h }));
  const seen = new Set(rows.map((r) => `${r.date}|${r.plate}`));
  for (const s of saved) {
    const plate = shortPlate(s.plate);
    const key = `${s.date}|${plate}`;
    const row: Row = {
      date: s.date,
      operator: s.operator ?? "",
      plate,
      before: s.before_sn ?? "",
      after: s.after_sn ?? "",
      symptom: s.symptom ?? "",
      photo: s.photo_after || s.photo_info ? "O" : "X",
      kind: s.kind,
    };
    const i = seen.has(key) ? rows.findIndex((r) => `${r.date}|${r.plate}` === key) : -1;
    if (i >= 0) rows[i] = row;
    else {
      rows.push(row);
      seen.add(key);
    }
  }
  rows.sort((a, b) => (a.date === b.date ? a.plate.localeCompare(b.plate) : a.date < b.date ? -1 : 1));
  return rows;
}

export async function renderModemXlsx(
  rows: Row[],
): Promise<{ buffer: Buffer; filename: string }> {
  const wb = new ExcelJS.Workbook();
  // 함수(COUNTIF/SUM)를 값 없이 넣으므로, 열 때 엑셀이 반드시 계산하도록 켠다
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.addWorksheet("모뎀 사용현황");
  WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  // 제목 A1:H4 + 우측 카운트(I1:J4) + 안내(I5:J5)
  // 원본은 증차·현장교체 2줄이었지만 예비품불량을 3번째 줄로 넣고 합계도 SUM(J1:J3)으로 넓혔다.
  ws.mergeCells("A1:H4");
  const title = ws.getCell("A1");
  title.value = "LTE모뎀 사용 현황";
  title.font = { ...FONT, size: 18, bold: true };
  title.alignment = CENTER;
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };

  const counts: [string, string][] = [
    ["증차", "COUNTIF(H:H,I1)"],
    ["현장교체", "COUNTIF(H:H,I2)"],
    ["예비품불량", "COUNTIF(H:H,I3)"],
    ["합계", "SUM(J1:J3)"],
  ];
  counts.forEach(([label, formula], i) => {
    const r = i + 1;
    ws.getCell(`I${r}`).value = label;
    ws.getCell(`I${r}`).alignment = CENTER;
    ws.getCell(`J${r}`).value = { formula, date1904: false };
    ws.getCell(`J${r}`).alignment = { vertical: "middle" };
  });
  ws.mergeCells("I5:J5");
  ws.getCell("I5").value = "※교체일자 = 설치일 기준";
  ws.getCell("I5").alignment = CENTER;
  for (let r = 1; r <= 5; r++) {
    for (const c of ["I", "J"]) {
      const cell = ws.getCell(`${c}${r}`);
      cell.font = { ...FONT, bold: true };
      cell.border = BORDER;
    }
  }

  // 머리글 + 데이터
  HEADERS.forEach((h, i) => {
    const cell = ws.getCell(5, i + 1);
    cell.value = h;
    cell.font = { ...FONT, bold: true };
    cell.alignment = CENTER;
    cell.border = BORDER;
  });
  // 숫자로 보이는 S/N은 숫자로 — 원본 양식과 같은 표시(앞자리 0은 그대로 문자열 유지)
  const num = (v: string) => (/^[1-9]\d*$/.test(v) ? Number(v) : v);
  rows.forEach((r, i) => {
    const row = ws.getRow(6 + i);
    const values = [
      new Date(`${r.date}T00:00:00Z`),
      r.operator,
      r.plate,
      num(r.before),
      num(r.after),
      r.symptom,
      r.photo,
      r.kind,
    ];
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v as ExcelJS.CellValue;
      cell.font = FONT;
      cell.alignment = CENTER;
      cell.border = BORDER;
      if (c === 0) cell.numFmt = "yyyy-mm-dd";
    });
  });

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, filename: `AI텔레콤 모뎀 사용내역_${kstStamp()}.xlsx` };
}
