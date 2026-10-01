// 새 프로젝트 '최초 업로드'용 — 업로드한 양식의 전개일정 시트 대상수량(C열·정적 E열)을
// 같은 파일의 차량리스트 대수(운수사|노선별)에 맞춰 고쳐 쓴다.
//
// 왜: 새 프로젝트는 B820 전개현황 파일을 복사해 차량리스트만 바꿔 올리는 경우가 많다.
//     그러면 전개일정의 B820 숫자(예: 2,744)가 그대로 남아 진행현황 총대수가 어긋난다.
//     다운로드 시 보정(fill-progress-xlsx)은 "템플릿 차량리스트 대비 델타"라 템플릿 자체가
//     모순이면 못 잡으므로, 최초 업로드 때 템플릿을 일관되게 만들어 둔다.
// 방법: fill-progress-xlsx와 같은 zip 셀 수술(수식·스타일 보존). 전개일정 5행~, A=운수사, B=노선.
//       차량리스트에 없는 (운수사|노선) 행은 0, 전개일정에 없는 조합은 그대로 두고 목록으로 알려준다.

import JSZip from "jszip";
import {
  resolveSheetPaths,
  parseSharedStrings,
  cellValue,
  setCellNumber,
} from "@/lib/export/fill-progress-xlsx";

export interface NormalizeResult {
  buffer: Buffer;
  rows: number; // 값을 쓴 전개일정 행 수
  unmatched: string[]; // 전개일정에 행이 없는 "운수사 노선" 조합
}

const norm = (s: string) => s.replace(/\s+/g, "").replace(/번$/, "");

/** counts: "운수사|||노선" → 대수 */
export async function normalizeScheduleQuantities(
  buf: Buffer,
  counts: Map<string, number>,
): Promise<NormalizeResult> {
  const zip = await JSZip.loadAsync(buf);
  const paths = await resolveSheetPaths(zip);
  const sFile = zip.file(paths.schedule);
  if (!sFile) return { buffer: buf, rows: 0, unmatched: [...counts.keys()].map((k) => k.replace("|||", " ")) };
  const shared = parseSharedStrings((await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "");

  // 노선 정규화 키 → 원래 키 (정확히 안 맞는 "번" 접미사·공백 차이 흡수)
  const byNorm = new Map<string, string>();
  for (const key of counts.keys()) {
    const [op, rt] = key.split("|||");
    byNorm.set(`${op}|||${norm(rt)}`, key);
  }

  let xml = await sFile.async("string");
  const matched = new Set<string>();
  let rows = 0;
  // 빈 행은 self-closing(<row …/>)일 수 있다 — 탐욕적 [^>]* 로 잡으면 다음 행까지 한 덩어리로 먹는다
  xml = xml.replace(/<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g, (whole, rnStr: string) => {
    const rn = Number(rnStr);
    if (rn < 5 || whole.endsWith("/>")) return whole;
    const aCell = whole.match(/<c r="A\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/);
    const bCell = whole.match(/<c r="B\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/);
    if (!aCell || !bCell) return whole;
    const op = cellValue(aCell[1], aCell[2] ?? "", shared).trim();
    const rt = cellValue(bCell[1], bCell[2] ?? "", shared).trim();
    if (!op || op === "합계") return whole;
    const key = counts.has(`${op}|||${rt}`) ? `${op}|||${rt}` : byNorm.get(`${op}|||${norm(rt)}`);
    const n = key ? counts.get(key) ?? 0 : 0;
    if (key) matched.add(key);
    let out = whole;
    for (const col of ["C", "E"] as const) out = setCellNumber(out, `${col}${rn}`, n);
    rows++;
    return out;
  });
  zip.file(paths.schedule, xml);

  const unmatched = [...counts.keys()].filter((k) => !matched.has(k)).map((k) => k.replace("|||", " "));
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer, rows, unmatched };
}

/** 차량리스트 행 → "운수사|||노선" 대수 */
export function groupCounts(rows: { operator: string; route: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.operator.trim()}|||${r.route.trim()}`;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}
