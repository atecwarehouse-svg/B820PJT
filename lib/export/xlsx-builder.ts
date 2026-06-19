// ExcelJS로 원본 양식을 코드 생성 (layout-spec 기반).
// 동적 추가 슬롯이 있어도 그리드 공식으로 행이 자동 확장된다.

import ExcelJS from "exceljs";
import type { SlotDef } from "@/lib/slots";
import {
  COL_WIDTH,
  LABEL_ROW_HEIGHT,
  TITLE_TEXT,
  ROW_DATE,
  ROW_OPERATOR,
  ROW_YEAR,
  computeLayout,
  rangeRef,
  cellRef,
  COL_FIRST,
  COL_LAST,
  IMAGE_ROWS,
} from "@/lib/export/layout-spec";

export interface SlotImage {
  buffer: Buffer;
  ext: "jpeg" | "png";
}

export interface BuildInput {
  plate: string;
  installDate: string;
  operator: string;
  route: string;
  year: string;
  model: string;
  beforeSlots: SlotDef[];
  afterSlots: SlotDef[];
  images: Map<string, SlotImage>; // slotKey -> 이미지
}

const IMAGE_ROW_HEIGHT = 15.75;
const THIN = { style: "thin" as const, color: { argb: "FF000000" } };
const FULL_BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const CENTER = { vertical: "middle" as const, horizontal: "center" as const, wrapText: true };

export async function buildWorkbook(input: BuildInput): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("사진첩", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const layout = computeLayout(input.beforeSlots, input.afterSlots);

  // 열 폭
  ws.getColumn(1).width = 3.5;
  for (let c = COL_FIRST; c <= COL_LAST; c++) ws.getColumn(c).width = COL_WIDTH;
  ws.getColumn(8).width = 3.625;
  ws.getColumn(9).width = 3.625;

  // 제목
  ws.mergeCells(rangeRef(layout.title.range));
  const titleCell = ws.getCell(cellRef(layout.title.row, COL_FIRST));
  titleCell.value = TITLE_TEXT;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = CENTER;
  ws.getRow(layout.title.row).height = LABEL_ROW_HEIGHT;

  // 헤더 정보 행 (라벨 + 값)
  const headerPairs: Array<[number, string, string, string, string]> = [
    // [row, leftLabel, leftValue, rightLabel, rightValue]
    [ROW_DATE, "설치일자", input.installDate, "차량NO", input.plate],
    [ROW_OPERATOR, "운수사", input.operator, "노선", input.route],
    [ROW_YEAR, "연식", input.year, "차종", input.model],
  ];
  for (const [row, lLabel, lVal, rLabel, rVal] of headerPairs) {
    ws.getRow(row).height = LABEL_ROW_HEIGHT;
    // 좌: B=라벨, C:D=값
    setLabel(ws, row, COL_FIRST, lLabel);
    ws.mergeCells(`${cellRef(row, COL_FIRST + 1)}:${cellRef(row, COL_FIRST + 2)}`);
    setValue(ws, row, COL_FIRST + 1, lVal);
    // 우: E=라벨, F:G=값
    setLabel(ws, row, COL_FIRST + 3, rLabel);
    ws.mergeCells(`${cellRef(row, COL_FIRST + 4)}:${cellRef(row, COL_FIRST + 5)}`);
    setValue(ws, row, COL_FIRST + 4, rVal);
  }

  // 섹션 (설치 전 / 설치 후)
  for (const section of [layout.before, layout.after]) {
    // 섹션 헤더
    ws.getRow(section.headerRow).height = LABEL_ROW_HEIGHT;
    ws.mergeCells(`${cellRef(section.headerRow, COL_FIRST)}:${cellRef(section.headerRow, COL_LAST)}`);
    const sh = ws.getCell(cellRef(section.headerRow, COL_FIRST));
    sh.value = section.section === "before" ? "설치 전" : "설치 후";
    sh.font = { bold: true, size: 11 };
    sh.alignment = { vertical: "middle", horizontal: "left" };
    sh.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };

    for (const sl of section.slots) {
      // 라벨 행 높이
      ws.getRow(sl.labelRow).height = LABEL_ROW_HEIGHT;
      // 라벨 병합 + 값
      ws.mergeCells(rangeRef(sl.labelCell));
      setLabel(ws, sl.labelCell.top, sl.labelCell.left, sl.slot.label);

      // 이미지 셀 병합
      ws.mergeCells(rangeRef(sl.imageCell));
      // 이미지 블록 행 높이
      for (let r = sl.imageCell.top; r <= sl.imageCell.bottom; r++) {
        ws.getRow(r).height = IMAGE_ROW_HEIGHT;
      }

      // 이미지 삽입
      const img = input.images.get(sl.slot.slotKey);
      if (img) {
        const imgId = wb.addImage({ buffer: img.buffer as any, extension: img.ext });
        ws.addImage(imgId, {
          tl: { col: sl.anchorTl.col, row: sl.anchorTl.row } as any,
          br: { col: sl.anchorBr.col, row: sl.anchorBr.row } as any,
          editAs: "oneCell",
        });
      }
    }
  }

  // 전체 테두리 (B2 ~ G lastRow)
  applyBorders(ws, layout.title.row, layout.lastRow);

  return wb;
}

function setLabel(ws: ExcelJS.Worksheet, row: number, col: number, text: string) {
  const cell = ws.getCell(cellRef(row, col));
  cell.value = text;
  cell.font = { bold: true, size: 10 };
  cell.alignment = CENTER;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
}

function setValue(ws: ExcelJS.Worksheet, row: number, col: number, text: string) {
  const cell = ws.getCell(cellRef(row, col));
  cell.value = text ?? "";
  cell.font = { size: 10 };
  cell.alignment = CENTER;
}

function applyBorders(ws: ExcelJS.Worksheet, topRow: number, bottomRow: number) {
  for (let r = topRow; r <= bottomRow; r++) {
    for (let c = COL_FIRST; c <= COL_LAST; c++) {
      ws.getCell(cellRef(r, c)).border = FULL_BORDER;
    }
  }
}

// IMAGE_ROWS는 layout-spec과 동기화 확인용 (사용처에서 import)
export { IMAGE_ROWS };
