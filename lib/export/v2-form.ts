// 새 프로젝트 진행현황 양식(v2) 생성 — 마스터(lib/export/templates/v2-master.xlsx) + 차량리스트 행 → 완성 xlsx.
//
// 마스터는 운수사 2행·날짜 열 쌍 2개·일자별 2행만 가진 뼈대. 여기서 엑셀 '행/열 삽입'(lib/xlsx/sheet-xml)으로
// 운수사 수·설치 예정일 수만큼 늘리고, 차량리스트를 써 넣고, 집계 수식의 차량리스트 범위($2:$X$N)를 차량 수에 맞춘다.
// 집계(진행현황·전개일정·일자별 현황)는 전부 차량리스트 수식이라 값을 따로 채울 게 없다 — 열 때 재계산(fullCalcOnLoad).
//
// 쓰는 곳: 빈 양식 다운로드(예시 1대) · 진행현황 다운로드/리포트 첨부(저장된 차량리스트 ⊕ DB 완료·증차·삭제).
// B820은 옛 양식(fill-progress-xlsx) 그대로.

import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseSheet, serializeSheet, insertRows, insertCols, snapshotRow, writeRowClone, snapshotCols, writeColsClone,
  setRowHidden, setColsHidden, setValue, setFormula, getRow, styleOf, sheetPathsByName, setFullCalcOnLoad, colNum, colName,
  type Sheet,
} from "@/lib/xlsx/sheet-xml";
import { V2_COLS, V2_LAST_COL, VCOL, isTarget, ymdFromSerial, type VehicleRow } from "@/lib/import/vehicle-columns";

const MASTER_PATH = join(process.cwd(), "lib", "export", "templates", "v2-master.xlsx");
let masterCache: Buffer | null = null;
export function loadMaster(): Buffer {
  return (masterCache ??= readFileSync(MASTER_PATH));
}

export interface V2BuildOptions {
  name: string; // 프로젝트명 — 시트 제목 "(프로젝트명) 설치 진행현황"
  vehicles: VehicleRow[]; // 차량리스트 행 (마스터 열 글자 → 값)
  period?: { start: string; end: string } | null; // 프로젝트 기간 (요약 줄)
  asOfSerial?: number; // 기준일(Excel 직렬값). 없으면 =TODAY()
  operatorNotes?: Map<string, string>; // 운수사 → 설치 진행현황 비고(M열) — 배차표 설치제외 등
}

// 시트 묶음: 설치(차량리스트 K/L/M) · 실사(G/H/I). 실사 시트는 마스터에서 숨김 상태.
const GROUPS = [
  { key: "설치", dateCol: VCOL.planned, targetOnly: true, label: "설치" },
  { key: "실사", dateCol: VCOL.surveyDate, targetOnly: false, label: "실사" },
] as const;

const OP_ROW = { prog: 12, sched: 9 }; // 운수사 블록 첫 행(템플릿 2행)
const DAY_ROW = 6; // 일자별 현황 첫 날짜 행(템플릿 2행)
const PAIR_COL = colNum("G"); // 전개일정 첫 날짜 열 쌍(계획·완료)
const SCHED_DATE_ROW = 6; // 전개일정 날짜 행

/** 운수사 블록을 n행으로 — 템플릿 2행(start·start+1)을 번갈아 복제(줄무늬 유지). n<2면 남는 행 숨김. */
function fitRows(s: Sheet, start: number, n: number): void {
  const tpl = [snapshotRow(s, start), snapshotRow(s, start + 1)];
  insertRows(s, start + 1, Math.max(0, n - 2));
  const total = Math.max(n, 2);
  for (let i = 0; i < total; i++) {
    writeRowClone(s, tpl[i % 2], start + i);
    setRowHidden(s, start + i, i >= n);
    // 남는 템플릿 행은 숨기고 수식도 비운다 — 빈 날짜(0)와 빈 완료일이 같다고 세어 합계 행을 더럽히지 않게
    if (i >= n) for (const c of getRow(s, start + i).cells) setValue(s, c.col, start + i, null);
  }
}

/** 전개일정 날짜 열 쌍을 n개로 — 첫 쌍은 첫 쌍 템플릿(누적 시작 수식), 나머지는 둘째 쌍 템플릿(누적 연결 수식) 복제 */
function fitPairs(s: Sheet, n: number): number[] {
  const tpl1 = snapshotCols(s, PAIR_COL, PAIR_COL + 1);
  const tpl2 = snapshotCols(s, PAIR_COL + 2, PAIR_COL + 3);
  insertCols(s, PAIR_COL + 2, Math.max(0, n - 2) * 2);
  const total = Math.max(n, 2);
  const cols: number[] = [];
  for (let k = 0; k < total; k++) {
    const first = PAIR_COL + 2 * k;
    writeColsClone(s, k === 0 ? tpl1 : tpl2, first);
    cols.push(first);
  }
  if (n < 2) setColsHidden(s, PAIR_COL + 2 * Math.max(n, 0), PAIR_COL + 3, true);
  return cols.slice(0, n);
}

const ymd = (serial: number) => ymdFromSerial(serial);
const text = (v: unknown) => String(v ?? "").trim();

export async function buildV2Workbook(o: V2BuildOptions): Promise<Buffer> {
  const zip = await JSZip.loadAsync(loadMaster());
  const wbPath = "xl/workbook.xml";
  let wb = await zip.file(wbPath)!.async("string");
  const paths = sheetPathsByName(wb, await zip.file("xl/_rels/workbook.xml.rels")!.async("string"));
  const load = async (name: string) => parseSheet(await zip.file(paths.get(name)!)!.async("string"), name);
  const vehicles = o.vehicles;
  const n = vehicles.length;
  const lastRow = Math.max(2, n + 1);
  const save = (s: Sheet) => {
    // 집계 수식의 차량리스트 범위 → 차량 수. 조건부서식 범위($2:$X$2)도 같은 규칙.
    zip.file(paths.get(s.name)!, serializeSheet(s).replace(/(차량리스트!\$[A-Z]{1,3}\$2:\$[A-Z]{1,3}\$)\d+/g, `$1${lastRow}`));
  };

  // ── 차량리스트: 제목 1행 유지, 2행 서식을 본보기로 차량 수만큼 ──
  const veh = await load("차량리스트");
  const tplRow = snapshotRow(veh, 2);
  const style = new Map(tplRow.cells.map((c) => [c.col, styleOf(c)]));
  veh.rows = veh.rows.filter((r) => r.r === 1);
  const lastCol = colNum(V2_LAST_COL);
  for (let i = 0; i < Math.max(n, 1); i++) {
    const r = i + 2;
    const row = getRow(veh, r);
    row.attrs = tplRow.attrs;
    const v = vehicles[i];
    for (let c = 1; c <= lastCol; c++) {
      row.cells.push({ col: c, attrs: style.get(c) ? ` s="${style.get(c)}"` : "", inner: "" });
      const val = v?.[colName(c)];
      if (val !== undefined && val !== null && val !== "") setValue(veh, c, r, val);
    }
    if (v && !text(v[VCOL.target])) setValue(veh, colNum(VCOL.target), r, "대상"); // 비면 대상
  }
  veh.tail = veh.tail
    .replace(/<autoFilter ref="[^"]*"/, `<autoFilter ref="A1:${V2_LAST_COL}${lastRow}"`)
    .replace(/ sqref="([A-Z]+)2:([A-Z]+)\d+"/g, ` sqref="$12:$2${lastRow}"`)
    .replace(/ sqref="L2:L\d+ H2:H\d+"/, ` sqref="L2:L${lastRow} H2:H${lastRow}"`)
    .replace(/<xm:sqref>([A-Z]+)2:([A-Z]+)\d+<\/xm:sqref>/g, `<xm:sqref>$12:$2${lastRow}</xm:sqref>`);
  save(veh);
  wb = wb.replace(/(<definedName name="_xlnm\._FilterDatabase"[^>]*>차량리스트!\$A\$1:\$[A-Z]+\$)\d+/, `$1${lastRow}`);

  // ── 집계 시트 ──
  const targets = vehicles.filter(isTarget);
  for (const g of GROUPS) {
    const pool = g.targetOnly ? targets : vehicles;
    const operators: { name: string; depot: string }[] = [];
    for (const v of pool) {
      const name = text(v[VCOL.operator]);
      if (!name) continue;
      const op = operators.find((x) => x.name === name);
      if (!op) operators.push({ name, depot: text(v[VCOL.depot]) });
      else if (!op.depot) op.depot = text(v[VCOL.depot]);
    }
    const days = [...new Set(pool.map((v) => v[g.dateCol]).filter((d): d is number => typeof d === "number"))].sort((a, b) => a - b);
    const summary =
      `${g.label} 대상 ${pool.length.toLocaleString()}대 · 운수사 ${operators.length}곳` +
      (days.length ? ` · ${g.label} 예정 ${ymd(days[0])} ~ ${ymd(days[days.length - 1])}` : "") +
      (o.period ? ` · 프로젝트 기간 ${o.period.start} ~ ${o.period.end}` : "");
    const title = (suffix: string) => `${o.name} ${g.key} ${suffix}`;

    const prog = await load(`${g.key} 진행현황`);
    fitRows(prog, OP_ROW.prog, operators.length);
    operators.forEach((op, i) => {
      setValue(prog, 1, OP_ROW.prog + i, i + 1);
      setValue(prog, colNum("B"), OP_ROW.prog + i, op.name);
      setValue(prog, colNum("C"), OP_ROW.prog + i, op.depot || null);
      if (g.key === "설치" && o.operatorNotes?.get(op.name)) setValue(prog, colNum("M"), OP_ROW.prog + i, o.operatorNotes.get(op.name)!);
    });
    setValue(prog, 1, 1, title("진행현황"));
    setValue(prog, 1, 2, summary);
    if (g.key === "설치") {
      if (o.asOfSerial) setValue(prog, colNum("K"), 1, o.asOfSerial);
      else setFormula(prog, colNum("K"), 1, "TODAY()");
    }
    save(prog);

    const sched = await load(`${g.key} 전개일정`);
    fitRows(sched, OP_ROW.sched, operators.length);
    operators.forEach((op, i) => {
      setValue(sched, 1, OP_ROW.sched + i, i + 1);
      setValue(sched, colNum("B"), OP_ROW.sched + i, op.name);
      setValue(sched, colNum("C"), OP_ROW.sched + i, op.depot || null);
    });
    const pairCols = fitPairs(sched, days.length);
    days.forEach((d, i) => setValue(sched, pairCols[i], SCHED_DATE_ROW, d));
    setValue(sched, 1, 1, title("전개일정"));
    setValue(sched, 1, 2, summary);
    save(sched);

    const daily = await load(`${g.key} 일자별 현황`);
    fitRows(daily, DAY_ROW, days.length);
    days.forEach((_d, i) => {
      setValue(daily, 1, DAY_ROW + i, i + 1);
      setFormula(daily, colNum("B"), DAY_ROW + i, `'${g.key} 전개일정'!${colName(pairCols[i])}$${SCHED_DATE_ROW}`);
    });
    setValue(daily, 1, 1, title("일자별 계획 · 실적"));
    setValue(daily, 1, 2, summary);
    save(daily);
  }

  zip.file(wbPath, setFullCalcOnLoad(wb));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** 빈 양식의 예시 차량 1대 — 차량번호가 "예)"로 시작해 업로드 때 건너뛴다 */
export function exampleVehicle(dateSerial: number): VehicleRow {
  return {
    A: 1, B: "○○교통", C: "5311", D: "○○차고지", E: "인천 서구 ○○동 123", F: "예) 인천70바4005",
    J: "대상", K: dateSerial, N: "2023", O: "현대", P: "유니버스 수소", Z: "○○전자",
  };
}

export { V2_COLS };
