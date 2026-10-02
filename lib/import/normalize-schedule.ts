// 새 프로젝트(B820 아님) 업로드용 — 업로드한 양식의 전개일정 시트(5행~)를 같은 파일의
// 차량리스트(운수사|노선별 대수·차고지)에 맞춰 고쳐 쓴다. 최초 등록·일정 변경 업로드 모두.
//
// 왜: 새 프로젝트는 빈 양식(또는 B820 파일 복사본)에 차량리스트만 채워 올린다.
//     전개일정 A(운수사)·B(노선)·D(차고지)·C/E(대상수량)를 손으로 또 적게 하면 빠뜨리거나
//     B820 숫자(예: 2,744)가 남아 진행현황 총대수가 어긋난다. 다운로드 시 보정(fill-progress-xlsx)은
//     "템플릿 차량리스트 대비 델타"라 템플릿 자체가 모순이면 못 잡으므로 업로드 때 일관되게 만든다.
// 방법: fill-progress-xlsx와 같은 zip 셀 수술(수식·스타일 보존).
//   ① 이미 있는 (운수사|노선) 행 → C/E=대수, D=차고지(차량리스트에 있을 때). 행 위치는 그대로(날짜별 계획 H열~ 유지).
//   ② 차량리스트에 없는 조합이 적힌 행 → A/B/D 비우고 C/E=0 (빈 양식의 ○○교통 예시 행도 여기서 지워진다).
//   ③ 전개일정에 없는 조합 → 빈 행(위에서부터)에 A/B/D/C/E를 써 넣는다. 진행현황 시트는 이 행들을 수식으로 참조.
//   빈 행이 모자라면 unmatched 로 알려준다.
//   ④ 날짜별 계획(4행 "계획" 열 = H·J·L…, B820 양식 61칸): 차량리스트 I열 설치 예정일이 하나라도 있으면
//      3행 날짜 = 기존 3행 날짜(프로젝트 기간) ∪ 예정일. 칸이 모자라면 계획·완료 열 쌍을 늘린다(schedule-columns).
//      상한(MAX_PLAN_DAYS=366)을 넘으면 예정일만, 그래도 넘으면 앞에서 자른다.
//      각 행의 계획 칸 = 그 (운수사|노선)에서 그 날짜 예정 대수. 예정일이 하나도 없으면 3행·계획 칸은 손대지 않는다.
//      → 진행현황 금일/누적 계획(A6·F6 SUMIF)이 자동으로 맞는다.
// ponytail: 셀이 아예 없는 행(<c> 태그 없음)에는 못 쓴다 — B820 기반 양식은 A~DY 서식 셀이 항상 있어 그대로 둔다.

import JSZip from "jszip";
import {
  resolveSheetPaths,
  parseSharedStrings,
  cellValue,
  setCellNumber,
  replaceCellText,
  clearCellText,
  whitenProgressRows,
} from "@/lib/export/fill-progress-xlsx";
import { MAX_PLAN_DAYS, colName, colNum, colorDateRow, expandPlanColumns, fixProgressPlanRange, planColumns } from "@/lib/import/schedule-columns";

export interface NormalizeResult {
  buffer: Buffer;
  rows: number; // 값을 쓴 전개일정 행 수
  unmatched: string[]; // 빈 행이 모자라 전개일정에 못 넣은 "운수사 노선" 조합
  planDays: number; // 날짜별 계획을 채운 날짜 수 (0 = 예정일 없음, 계획 칸 그대로)
  droppedDays: number; // 날짜 상한(MAX_PLAN_DAYS)을 넘어 빠진 예정일 수
}

type Row = { operator: string; route: string; planned_date: string | null };

const norm = (s: string) => s.replace(/\s+/g, "").replace(/번$/, "");
const keyOf = (r: Row) => `${r.operator.trim()}|||${r.route.trim()}`;
// "YYYY-MM-DD" → Excel 직렬값
const serialOf = (d: string) =>
  Math.round((Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) - Date.UTC(1899, 11, 30)) / 86400000);

/** rows: 차량리스트 차량(등장 순), depots: "운수사|||노선" → 차고지 */
export async function normalizeScheduleQuantities(
  buf: Buffer,
  rows: Row[],
  depots: Map<string, string> = new Map(),
): Promise<NormalizeResult> {
  const counts = new Map<string, number>(); // 키 → 대수 (등장 순서 유지)
  const plans = new Map<string, Map<number, number>>(); // 키 → (예정일 직렬값 → 대수)
  for (const r of rows) {
    const key = keyOf(r);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!r.planned_date) continue;
    const s = serialOf(r.planned_date);
    const m = plans.get(key) ?? new Map<number, number>();
    m.set(s, (m.get(s) ?? 0) + 1);
    plans.set(key, m);
  }

  const zip = await JSZip.loadAsync(buf);
  const paths = await resolveSheetPaths(zip);
  const sFile = zip.file(paths.schedule);
  if (!sFile) {
    return { buffer: buf, rows: 0, unmatched: [...counts.keys()].map((k) => k.replace("|||", " ")), planDays: 0, droppedDays: 0 };
  }
  const shared = parseSharedStrings((await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "");

  // 노선 정규화 키 → 원래 키 (정확히 안 맞는 "번" 접미사·공백 차이 흡수)
  const byNorm = new Map<string, string>();
  for (const key of counts.keys()) {
    const [op, rt] = key.split("|||");
    byNorm.set(`${op}|||${norm(rt)}`, key);
  }

  let xml = await sFile.async("string");
  // 빈 행은 self-closing(<row …/>)일 수 있다 — 탐욕적 [^>]* 로 잡으면 다음 행까지 한 덩어리로 먹는다
  const rowRe = /<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
  const cellOf = (whole: string, col: string) => {
    const m = whole.match(new RegExp(`<c r="${col}\\d+"([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)`));
    return m ? cellValue(m[1], m[2] ?? "", shared).trim() : "";
  };

  // 0) 날짜별 계획 칸(④): 4행 "계획" 열, 3행 기존 날짜, 예정일 → 3행에 쓸 날짜 목록
  const rowXml = (rn: number) => xml.match(new RegExp(`<row r="${rn}"[^>]*?(?:/>|>([\\s\\S]*?)</row>)`))?.[1] ?? "";
  const cellsOf = (inner: string) => [...inner.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)];
  let planCols = planColumns(xml, shared);
  const row3 = new Map(cellsOf(rowXml(3)).map((c) => [c[1], c[3] ?? ""]));
  const existing = planCols
    .map((col) => Number(row3.get(col)?.match(/^<v>(\d+(?:\.\d+)?)<\/v>$/)?.[1]))
    .filter((n) => Number.isFinite(n) && n > 0);
  const planned = [...new Set([...plans.values()].flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  let dates: number[] = [];
  let droppedDays = 0;
  if (planned.length && planCols.length) {
    dates = [...new Set([...existing, ...planned])].sort((a, b) => a - b);
    if (dates.length > MAX_PLAN_DAYS) dates = planned; // 상한을 넘으면 기간 날짜는 버리고 예정일만
    droppedDays = Math.max(0, dates.length - MAX_PLAN_DAYS);
    dates = dates.slice(0, MAX_PLAN_DAYS);
    // 칸이 모자라면 계획·완료 열 쌍을 늘린다
    if (dates.length > planCols.length) ({ sx: xml, cols: planCols } = expandPlanColumns(xml, shared, dates.length));
  }

  // 1) 행 스캔: 5행 ~ 합계 전 행. 조합이 있는 행 / 비어 있는 행 분류
  const edits = new Map<number, (whole: string) => string>();
  const matched = new Set<string>();
  const blanks: number[] = [];
  const write = (rn: number, key: string, labels: boolean) => (whole: string) => {
    const [op, rt] = key.split("|||");
    let out = whole;
    if (labels) {
      out = replaceCellText(out, `A${rn}`, op);
      out = replaceCellText(out, `B${rn}`, rt);
    }
    const depot = depots.get(key);
    if (depot) out = replaceCellText(out, `D${rn}`, depot);
    const n = counts.get(key) ?? 0;
    for (const col of ["C", "E"] as const) out = setCellNumber(out, `${col}${rn}`, n);
    if (dates.length) {
      // 날짜별 계획 대수 — 그 날짜 예정이 없으면 비움
      const plan = plans.get(key);
      planCols.forEach((col, i) => {
        const v = dates[i] !== undefined ? plan?.get(dates[i]) : undefined;
        out = v ? setCellNumber(out, `${col}${rn}`, v) : clearCellText(out, `${col}${rn}`);
      });
    }
    return out;
  };
  for (const m of xml.matchAll(rowRe)) {
    const rn = Number(m[1]);
    if (rn < 5) continue;
    const op = cellOf(m[0], "A");
    const rt = cellOf(m[0], "B");
    if (op === "합계") break;
    if (m[0].endsWith("/>")) continue; // 셀이 없는 행 — 쓸 자리가 없다
    if (!op && !rt) {
      blanks.push(rn);
      continue;
    }
    const key = counts.has(`${op}|||${rt}`) ? `${op}|||${rt}` : byNorm.get(`${op}|||${norm(rt)}`);
    if (key && !matched.has(key)) {
      matched.add(key);
      edits.set(rn, write(rn, key, false));
    } else {
      // 차량리스트에 없는 조합(또는 중복 행) → 라벨·날짜별 계획값(H열~ 값 셀) 비우고 0. 이 행은 ③에서 재사용된다.
      edits.set(rn, (whole) => {
        let out = whole;
        for (const col of ["A", "B", "D"] as const) out = clearCellText(out, `${col}${rn}`);
        for (const col of ["C", "E"] as const) out = setCellNumber(out, `${col}${rn}`, 0);
        return out.replace(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (c, col: string, attrs: string, inner?: string) =>
          (col.length > 1 || col > "G") && inner && !/<f\b/.test(inner) ? clearCellText(c, `${col}${rn}`) : c);
      });
      blanks.push(rn);
    }
  }

  // 2) 전개일정에 없는 조합 → 빈 행(비운 행 포함)에 차례로
  const unmatched: string[] = [];
  for (const key of counts.keys()) {
    if (matched.has(key)) continue;
    const rn = blanks.shift();
    if (rn === undefined) {
      unmatched.push(key.replace("|||", " "));
      continue;
    }
    const prev = edits.get(rn);
    edits.set(rn, (whole) => write(rn, key, true)(prev ? prev(whole) : whole));
  }

  const rowCount = edits.size;
  // 3행 날짜 — 계획 칸 순서대로, 남는 칸은 비움
  if (dates.length) {
    edits.set(3, (whole) => {
      let out = whole;
      planCols.forEach((col, i) => {
        out = dates[i] !== undefined ? setCellNumber(out, `${col}3`, dates[i]) : clearCellText(out, `${col}3`);
      });
      return out;
    });
  }

  xml = xml.replace(rowRe, (whole, rnStr: string) => edits.get(Number(rnStr))?.(whole) ?? whole);
  const stylesFile = zip.file("xl/styles.xml");
  let styles = (await stylesFile?.async("string")) ?? "";
  // 3행 날짜 글자색: 평일 검정 · 토 파랑 · 일·공휴일 빨강
  if (styles && dates.length) ({ sx: xml, styles } = colorDateRow(xml, styles, planCols));
  zip.file(paths.schedule, xml);
  const pFile = zip.file(paths.progress);
  if (pFile) {
    let px = await pFile.async("string");
    // 진행현황 금일·누적 계획(A6·F6) SUMIF 범위를 전개일정 마지막 열까지 (B820 양식은 DW까지라 61번째 날이 빠져 있었다)
    if (planCols.length) px = fixProgressPlanRange(px, colName(colNum(planCols[planCols.length - 1]) + 1));
    // 12행~ 바탕 흰색으로 — 저장 양식은 늘 흰 바탕, 완료=녹색·설치제외=베이지는 다운로드 때 칠한다
    if (styles) ({ pXml: px, stylesXml: styles } = whitenProgressRows(px, styles));
    zip.file(paths.progress, px);
  }
  if (styles) zip.file("xl/styles.xml", styles);

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer, rows: rowCount, unmatched, planDays: dates.length, droppedDays };
}
