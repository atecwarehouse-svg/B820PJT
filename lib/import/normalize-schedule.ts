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
// ponytail: 셀이 아예 없는 행(<c> 태그 없음)에는 못 쓴다 — B820 기반 양식은 A~E 서식 셀이 항상 있어 그대로 둔다.

import JSZip from "jszip";
import {
  resolveSheetPaths,
  parseSharedStrings,
  cellValue,
  setCellNumber,
  replaceCellText,
  clearCellText,
} from "@/lib/export/fill-progress-xlsx";

export interface NormalizeResult {
  buffer: Buffer;
  rows: number; // 값을 쓴 전개일정 행 수
  unmatched: string[]; // 빈 행이 모자라 전개일정에 못 넣은 "운수사 노선" 조합
}

const norm = (s: string) => s.replace(/\s+/g, "").replace(/번$/, "");

/** counts: "운수사|||노선" → 대수 (차량리스트 등장 순), depots: 같은 키 → 차고지 */
export async function normalizeScheduleQuantities(
  buf: Buffer,
  counts: Map<string, number>,
  depots: Map<string, string> = new Map(),
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
  // 빈 행은 self-closing(<row …/>)일 수 있다 — 탐욕적 [^>]* 로 잡으면 다음 행까지 한 덩어리로 먹는다
  const rowRe = /<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
  const cellOf = (whole: string, col: string) => {
    const m = whole.match(new RegExp(`<c r="${col}\\d+"([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)`));
    return m ? cellValue(m[1], m[2] ?? "", shared).trim() : "";
  };

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

  xml = xml.replace(rowRe, (whole, rnStr: string) => edits.get(Number(rnStr))?.(whole) ?? whole);
  zip.file(paths.schedule, xml);

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer, rows: edits.size, unmatched };
}

/** 차량리스트 행 → "운수사|||노선" 대수 (등장 순서 유지) */
export function groupCounts(rows: { operator: string; route: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.operator.trim()}|||${r.route.trim()}`;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}
