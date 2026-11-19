// '올린 양식 그대로' 진행현황 다운로드(기능 플래그 ownForm, 공항 B830).
// 마지막으로 올린 전개현황 엑셀을 그대로 쓰고 다음만 바꾼다:
//   · 차량리스트 설치 완료여부(L)·완료일(M) = 앱 완료 기록(기준일까지)
//   · 「설치 진행현황」 K1 기준일 = 다운로드 기준일
//   · 「설치 진행현황」 운수사별 비고(M) 뒤에 배차표 설치제외 차량
//   · 「설치 진행현황」 비고(A6) = 리포트 메일 첨부일 때 그 리포트 특이사항
// 계획(전개일정 계획 칸)·예정일·시트 구성·열 순서는 사용자가 엑셀에 적은 그대로 — 바뀌면 엑셀을 다시 올린다.
// 시트 XML만 고쳐서 서식·조건부서식·숨김 시트를 바이트 그대로 보존한다(lib/xlsx/sheet-xml.ts).
import JSZip from "jszip";
import {
  parseSheet, serializeSheet, setValue, setStyle, getRow, styleOf, stripFormulaValues, sheetPathsByName, setFullCalcOnLoad,
} from "@/lib/xlsx/sheet-xml";
import { cellValue, parseSharedStrings, type CompletedInfo, type ExclusionInfo } from "@/lib/export/fill-progress-xlsx";
import { mapHeaders, VCOL } from "@/lib/import/vehicle-columns";

const VEHICLE = "차량리스트";
const PROGRESS = "설치 진행현황";

export async function fillOwnForm(
  template: Buffer,
  completed: Map<string, CompletedInfo>,
  asOfSerial: number,
  exclusions: ExclusionInfo[],
  notes?: string, // 리포트 특이사항 → 「설치 진행현황」 비고(A6:C7 병합, 양식 안내 '보고용 특이사항 자유 입력')
): Promise<{ buffer: Buffer; filled: number; missing: string[] }> {
  const zip = await JSZip.loadAsync(template);
  const wbXml = await zip.file("xl/workbook.xml")!.async("string");
  const paths = sheetPathsByName(wbXml, await zip.file("xl/_rels/workbook.xml.rels")!.async("string"));
  const shared = parseSharedStrings((await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "");
  const vPath = paths.get(VEHICLE);
  if (!vPath) throw new Error("저장된 양식에 「차량리스트」 시트가 없습니다. 일정 업로드로 다시 등록하세요.");

  // 차량리스트 — 1행 제목으로 열을 찾는다(사용자가 열을 끼워 넣어도 맞게)
  const vs = parseSheet(await zip.file(vPath)!.async("string"), VEHICLE);
  const text = (r: number, col: number | undefined) => {
    const c = col ? getRow(vs, r).cells.find((x) => x.col === col) : undefined;
    return c ? cellValue(c.attrs, c.inner, shared).trim() : "";
  };
  const lastCol = Math.max(...getRow(vs, 1).cells.map((c) => c.col));
  const map = mapHeaders(Array.from({ length: lastCol }, (_, i) => text(1, i + 1)));
  const [plateC, targetC, doneC, dateC, plannedC] = [VCOL.plate, VCOL.target, VCOL.done, VCOL.doneDate, VCOL.planned].map((k) => map.get(k));
  if (!plateC || !doneC || !dateC) throw new Error("차량리스트에서 차량번호·설치 완료여부·설치 완료일 열을 찾지 못했습니다.");

  // 완료일 칸 서식 — 빈 칸에 서식이 없으면 날짜 대신 숫자로 보이므로 값 있는 칸의 서식을 빌린다
  const dateStyle = vs.rows
    .map((row) => row.cells.find((c) => c.col === dateC && /<v>/.test(c.inner)))
    .map(styleOf)
    .find(Boolean);
  const inFile = new Set<string>();
  let filled = 0;
  // 기준일까지 누적 계획 — 「설치 일자별 현황」 J(예정일 K ≤ 기준일 대수)와 같은 셈.
  // 엑셀 수식 범위는 대상 행뿐이라(아래쪽 말소 행 제외) 대상 행만 센다 = plan_days 누적
  let cumPlan = 0;
  for (const row of [...vs.rows]) {
    if (row.r < 2) continue;
    const plate = text(row.r, plateC);
    const target = text(row.r, targetC);
    if (!plate || (target !== "" && target !== "대상")) continue; // 말소·제외 행은 손대지 않는다
    const planned = Number(text(row.r, plannedC));
    if (planned > 0 && planned <= asOfSerial) cumPlan++;
    inFile.add(plate);
    const done = completed.get(plate);
    setValue(vs, doneC, row.r, done ? "완료" : null);
    setValue(vs, dateC, row.r, done ? done.serial : null);
    if (done) {
      filled++;
      if (dateStyle && !styleOf(getRow(vs, row.r).cells.find((c) => c.col === dateC))) setStyle(vs, dateC, row.r, dateStyle);
    }
  }
  zip.file(vPath, serializeSheet(vs));
  // ponytail: 엑셀에 없는 차량(증차)은 붙이지 않는다 — 집계 수식 범위가 사용자 고정값이라 넣어도 안 잡힌다. 다시 올리면 반영.
  const missing = [...completed.keys()].filter((p) => !inFile.has(p));

  // 기준일 + 운수사별 비고(설치제외)
  const pPath = paths.get(PROGRESS);
  if (pPath) {
    const ps = parseSheet(await zip.file(pPath)!.async("string"), PROGRESS);
    setValue(ps, 11, 1, asOfSerial); // K1
    // A6 비고: 첫 줄 = 누적 선행(「설치 일자별 현황」 N = 누적 설치 − 누적 계획, 0이면 생략), 다음 줄 = 리포트 특이사항
    const lead = filled - cumPlan;
    const memo = [lead > 0 ? `누적 선행 +${lead}대` : "", notes?.trim() ?? ""].filter(Boolean).join("\n");
    if (memo) setValue(ps, 1, 6, memo); // A6
    const excl = new Map<string, string[]>();
    for (const e of exclusions) excl.set(e.operator, [...(excl.get(e.operator) ?? []), e.plate + (e.reason ? `(${e.reason})` : "")]);
    for (const row of ps.rows) {
      if (row.r < 12) continue;
      const cellText = (col: number) => {
        const c = row.cells.find((x) => x.col === col);
        return c ? cellValue(c.attrs, c.inner, shared).trim() : "";
      };
      const op = cellText(2);
      if (op.replace(/\s/g, "") === "합계") break;
      const plates = excl.get(op);
      if (!plates) continue;
      const line = `설치제외 ${plates.length}대: ${plates.join(", ")}`;
      const prev = cellText(13);
      setValue(ps, 13, row.r, prev && !prev.includes(line) ? `${prev} / ${line}` : line);
    }
    zip.file(pPath, serializeSheet(ps));
  }

  // 수식 캐시 값 제거 + 열 때 전체 재계산 — 엑셀 아닌 미리보기에서 옛 숫자가 보이지 않게(v2 다운로드와 같은 방식)
  for (const path of paths.values()) {
    const xml = await zip.file(path)?.async("string");
    if (!xml || !/<f[\s>]/.test(xml)) continue;
    const s = parseSheet(xml, "");
    stripFormulaValues(s);
    zip.file(path, serializeSheet(s));
  }
  zip.file("xl/workbook.xml", setFullCalcOnLoad(wbXml));
  if (zip.file("xl/calcChain.xml")) {
    zip.remove("xl/calcChain.xml");
    const ct = await zip.file("[Content_Types].xml")!.async("string");
    zip.file("[Content_Types].xml", ct.replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ""));
    const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
    zip.file("xl/_rels/workbook.xml.rels", rels.replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/, ""));
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer, filled, missing };
}
