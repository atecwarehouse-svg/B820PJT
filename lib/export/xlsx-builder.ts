// ExcelJS로 원본 양식을 코드 생성 (layout-spec 기반).
// 동적 추가 슬롯이 있어도 그리드 공식으로 행이 자동 확장된다.
// 다중 차량은 한 시트에 차량별 블록으로 쌓고, 차량마다 페이지 분할(인쇄 시 차량당 1장).

import ExcelJS from "exceljs";
import type { SlotDef } from "@/lib/slots";
import {
  COL_WIDTH,
  LABEL_ROW_HEIGHT,
  TITLE_TEXT,
  DEFAULT_BASE_ROW,
  computeLayout,
  rangeRef,
  cellRef,
  COL_FIRST,
  COL_LAST,
  SLOTS_PER_ROW,
  IMAGE_ROWS,
  type FullLayout,
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
  marks?: Map<string, string>; // slotKey -> 사진 대신 칸 가운데 표시할 텍스트 (예: 증차차량)
}

const IMAGE_ROW_HEIGHT = 15.75;
const THIN = { style: "thin" as const, color: { argb: "FF000000" } };
const FULL_BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const CENTER = { vertical: "middle" as const, horizontal: "center" as const, wrapText: true };

function setColumns(ws: ExcelJS.Worksheet) {
  ws.getColumn(1).width = 3.5;
  for (let c = COL_FIRST; c <= COL_LAST; c++) ws.getColumn(c).width = COL_WIDTH;
  ws.getColumn(8).width = 3.625;
  ws.getColumn(9).width = 3.625;
}

// 한 차량 블록을 baseRow부터 작성하고 마지막 행 번호를 반환.
function writeVehicleBlock(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  input: BuildInput,
  baseRow: number,
): number {
  const layout: FullLayout = computeLayout(
    input.beforeSlots,
    input.afterSlots,
    baseRow,
  );

  // 제목
  ws.mergeCells(rangeRef(layout.title.range));
  const titleCell = ws.getCell(cellRef(layout.title.row, COL_FIRST));
  titleCell.value = TITLE_TEXT;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = CENTER;
  ws.getRow(layout.title.row).height = LABEL_ROW_HEIGHT;

  // 헤더 정보 행 (라벨 + 값)
  const headerPairs: Array<[number, string, string, string, string]> = [
    [layout.header.dateRow, "설치일자", input.installDate, "차량NO", input.plate],
    [layout.header.operatorRow, "운수사", input.operator, "노선", input.route],
    [layout.header.yearRow, "연식", input.year, "차종", input.model],
  ];
  for (const [row, lLabel, lVal, rLabel, rVal] of headerPairs) {
    ws.getRow(row).height = LABEL_ROW_HEIGHT;
    setLabel(ws, row, COL_FIRST, lLabel);
    ws.mergeCells(`${cellRef(row, COL_FIRST + 1)}:${cellRef(row, COL_FIRST + 2)}`);
    setValue(ws, row, COL_FIRST + 1, lVal);
    setLabel(ws, row, COL_FIRST + 3, rLabel);
    ws.mergeCells(`${cellRef(row, COL_FIRST + 4)}:${cellRef(row, COL_FIRST + 5)}`);
    setValue(ws, row, COL_FIRST + 4, rVal);
  }

  // 섹션 (설치 전 / 설치 후)
  for (const section of [layout.before, layout.after]) {
    ws.getRow(section.headerRow).height = LABEL_ROW_HEIGHT;
    ws.mergeCells(`${cellRef(section.headerRow, COL_FIRST)}:${cellRef(section.headerRow, COL_LAST)}`);
    const sh = ws.getCell(cellRef(section.headerRow, COL_FIRST));
    sh.value = section.section === "before" ? "설치 전" : "설치 후";
    sh.font = { bold: true, size: 11 };
    sh.alignment = { vertical: "middle", horizontal: "left" };
    sh.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };

    for (const sl of section.slots) {
      ws.getRow(sl.labelRow).height = LABEL_ROW_HEIGHT;
      ws.mergeCells(rangeRef(sl.labelCell));
      setLabel(ws, sl.labelCell.top, sl.labelCell.left, sl.slot.label);

      ws.mergeCells(rangeRef(sl.imageCell));
      for (let r = sl.imageCell.top; r <= sl.imageCell.bottom; r++) {
        ws.getRow(r).height = IMAGE_ROW_HEIGHT;
      }

      const img = input.images.get(sl.slot.slotKey);
      if (img) {
        const imgId = wb.addImage({ buffer: img.buffer as any, extension: img.ext });
        ws.addImage(imgId, {
          tl: { col: sl.anchorTl.col, row: sl.anchorTl.row } as any,
          br: { col: sl.anchorBr.col, row: sl.anchorBr.row } as any,
          editAs: "oneCell",
        });
      } else {
        const mark = input.marks?.get(sl.slot.slotKey);
        if (mark) {
          const cell = ws.getCell(cellRef(sl.imageCell.top, sl.imageCell.left));
          cell.value = mark;
          cell.font = { bold: true, size: 11 };
          cell.alignment = CENTER;
        }
      }
    }

    // 마지막 줄이 3칸을 다 못 채우면, 남는 빈 칸을 하나로 병합해 깔끔하게(제목 폭에 맞춤)
    const n = section.slots.length;
    const inLastRow = n % SLOTS_PER_ROW;
    if (n > 0 && inLastRow !== 0) {
      const lastLabelRow = section.slots[n - 1].labelRow;
      const firstEmptyCol = COL_FIRST + inLastRow * 2;
      ws.mergeCells(
        `${cellRef(lastLabelRow, firstEmptyCol)}:${cellRef(lastLabelRow + IMAGE_ROWS, COL_LAST)}`,
      );
    }
  }

  applyBorders(ws, layout.title.row, layout.lastRow);
  return layout.lastRow;
}

// 단일 차량
export async function buildWorkbook(input: BuildInput): Promise<ExcelJS.Workbook> {
  return buildWorkbookMulti([input]);
}

// 다중 차량 — 한 시트에 차량별 블록을 쌓고 차량마다 페이지 분할.
export async function buildWorkbookMulti(
  inputs: BuildInput[],
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("사진첩", {
    views: [{ showGridLines: false }], // 기본 격자선 숨김 (빈 칸 깔끔하게)
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0, // 세로는 수동 페이지 분할 사용
    },
  });
  setColumns(ws);

  let base = DEFAULT_BASE_ROW;
  inputs.forEach((input, i) => {
    if (i > 0) {
      // 직전 차량 마지막 행 다음에서 새 페이지 시작
      ws.getRow(base - 1).addPageBreak();
    }
    const lastRow = writeVehicleBlock(wb, ws, input, base);
    base = lastRow + 1;
  });

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
