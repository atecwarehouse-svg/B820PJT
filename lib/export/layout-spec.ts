// ============================================================
// 레이아웃 단일 진실원 (Single Source of Truth)
// 원본 엑셀 양식(B800 설치 사진첩)의 그리드 기하를 코드로 표현.
// 화면(print 페이지), 엑셀 export, PDF export가 모두 이 모듈을 공유한다.
//
// 원본 분석값:
//  - Sheet 영역 B2:G47, 열 B~G(2~7) 폭 15, 라벨/헤더행 높이 24.75
//  - 사진 셀 = 2열 × 7행 병합, 한 라벨행 아래 3개 슬롯(B:C, D:E, F:G)
//  - 이미지 앵커 editAs="oneCell", from(col,row)~to(col,row) 0-index
// ============================================================

import type { SlotDef } from "@/lib/slots";

export const COL_FIRST = 2; // B열 (1-based)
export const COL_LAST = 7; // G열
export const SLOTS_PER_ROW = 3;
export const IMAGE_ROWS = 7; // 이미지 블록 높이(행)
export const LABEL_ROWS = 1; // 라벨 행 높이(행)
export const BLOCK_ROWS = LABEL_ROWS + IMAGE_ROWS; // 슬롯 한 줄이 차지하는 총 행 = 8

export const COL_WIDTH = 15; // 엑셀 열 폭
export const LABEL_ROW_HEIGHT = 24.75; // 라벨/헤더 행 높이(pt)

// 기본 시작행 (1-based). 다중 차량을 한 시트에 쌓을 때 baseRow로 오프셋.
export const DEFAULT_BASE_ROW = 2;
// baseRow 기준 상대 오프셋
const OFF_DATE = 1; // 설치일자 / 차량NO
const OFF_OPERATOR = 2; // 운수사 / 노선
const OFF_YEAR = 3; // 연식 / 차종
const OFF_BEFORE_HEADER = 4; // "설치 전"
const OFF_BEFORE_GRID = 5; // 설치 전 첫 라벨행

export const TITLE_TEXT = "B820 설치 사진";

export interface CellRange {
  // 1-based 셀 주소 (병합용)
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface SlotLayout {
  slot: SlotDef;
  labelRow: number; // 1-based 라벨 행
  labelCell: CellRange; // 라벨 병합 범위 (2열)
  imageCell: CellRange; // 이미지 병합 범위 (2열 × 7행)
  // ExcelJS addImage 앵커 (0-based, tl 포함 / br 배타)
  anchorTl: { col: number; row: number };
  anchorBr: { col: number; row: number };
}

export interface SectionLayout {
  section: "before" | "after";
  headerRow: number; // 섹션 헤더 행 (병합 B:G)
  gridStart: number; // 첫 라벨행
  slots: SlotLayout[];
  endRow: number; // 섹션 마지막 행
}

export interface FullLayout {
  baseRow: number;
  title: { row: number; range: CellRange };
  header: { dateRow: number; operatorRow: number; yearRow: number };
  before: SectionLayout;
  after: SectionLayout;
  lastRow: number;
}

function colToLetter(col: number): string {
  let s = "";
  let n = col;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function cellRef(row: number, col: number): string {
  return `${colToLetter(col)}${row}`;
}

export function rangeRef(r: CellRange): string {
  return `${cellRef(r.top, r.left)}:${cellRef(r.bottom, r.right)}`;
}

// 한 슬롯의 위치 계산
function computeSlot(slot: SlotDef, idx: number, gridStart: number): SlotLayout {
  const gridRow = Math.floor(idx / SLOTS_PER_ROW);
  const colInRow = idx % SLOTS_PER_ROW;
  const labelRow = gridStart + gridRow * BLOCK_ROWS;
  const colStart = COL_FIRST + colInRow * 2; // B / D / F (1-based)

  const labelCell: CellRange = {
    top: labelRow,
    left: colStart,
    bottom: labelRow,
    right: colStart + 1,
  };
  const imageCell: CellRange = {
    top: labelRow + LABEL_ROWS,
    left: colStart,
    bottom: labelRow + IMAGE_ROWS,
    right: colStart + 1,
  };
  // 0-based 앵커: 라벨행(1-based)이 이미지 시작 0-index와 수치적으로 동일
  const anchorTl = { col: colStart - 1, row: labelRow };
  const anchorBr = { col: colStart + 1, row: labelRow + IMAGE_ROWS };

  return { slot, labelRow, labelCell, imageCell, anchorTl, anchorBr };
}

function computeSection(
  section: "before" | "after",
  headerRow: number,
  gridStart: number,
  slots: SlotDef[],
): SectionLayout {
  const slotLayouts = slots.map((s, i) => computeSlot(s, i, gridStart));
  const gridRows = Math.ceil(slots.length / SLOTS_PER_ROW);
  const endRow = gridStart + gridRows * BLOCK_ROWS - 1;
  return { section, headerRow, gridStart, slots: slotLayouts, endRow };
}

// 설치전/설치후 슬롯 배열을 받아 전체 레이아웃 계산.
// 설치전 항목이 늘어나면 설치후 섹션이 자동으로 아래로 시프트된다.
// baseRow로 시작행을 옮기면 다중 차량을 한 시트에 쌓을 수 있다.
export function computeLayout(
  beforeSlots: SlotDef[],
  afterSlots: SlotDef[],
  baseRow: number = DEFAULT_BASE_ROW,
): FullLayout {
  const titleRow = baseRow;
  const beforeHeaderRow = baseRow + OFF_BEFORE_HEADER;
  const beforeGridStart = baseRow + OFF_BEFORE_GRID;

  const before = computeSection(
    "before",
    beforeHeaderRow,
    beforeGridStart,
    beforeSlots,
  );

  const afterHeaderRow = before.endRow + 1;
  const afterGridStart = afterHeaderRow + 1;
  const after = computeSection(
    "after",
    afterHeaderRow,
    afterGridStart,
    afterSlots,
  );

  return {
    baseRow,
    title: {
      row: titleRow,
      range: { top: titleRow, left: COL_FIRST, bottom: titleRow, right: COL_LAST },
    },
    header: {
      dateRow: baseRow + OFF_DATE,
      operatorRow: baseRow + OFF_OPERATOR,
      yearRow: baseRow + OFF_YEAR,
    },
    before,
    after,
    lastRow: after.endRow,
  };
}
