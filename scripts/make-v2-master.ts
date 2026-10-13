/**
 * 새 프로젝트 진행현황 양식 마스터(lib/export/templates/v2-master.xlsx) 만들기.
 *
 * 입력: 공항버스 B800 설치 전개현황 엑셀(사용자 디자인 원본). 출력: 차량·운수사·날짜를 뺀 뼈대.
 *   · 시트: 실사/설치 × (진행현황·전개일정·일자별 현황) + 차량리스트. 거치유형·안내 시트는 뺀다(프로젝트 전용 자료).
 *   · 운수사 행 2개, 날짜 열 쌍 2개, 일자별 행 2개만 남긴다 → 런타임(lib/export/v2-form.ts)이 엑셀 '행/열 삽입' 의미로 늘린다.
 *   · 차량리스트는 제목 1행 + 서식만 남은 2행. 집계 수식의 차량리스트 범위는 $2:$X$2 (런타임이 차량 수만큼 늘림).
 *   · 기준일: 안내!C6 → '설치 진행현황'!K1(=TODAY(), 다운로드 때 기준일 값으로 교체).
 *   · 설치 대상 판정: (K열 날짜 있음) → (J열="대상"). 말소·제외 차량이 리스트에 남아도 집계에서 빠진다.
 *
 * 사용법: npx tsx scripts/make-v2-master.ts "C:/경로/공항버스_B800_설치_전개현황_YYMMDD.xlsx"
 * 디자인이 바뀌면 새 원본으로 다시 돌린다(시트 이름·행/열 자리가 같아야 한다).
 */
import JSZip from "jszip";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import {
  parseSheet, serializeSheet, materializeShared, stripFormulaValues, deleteRows, deleteCols, setValue, setFormula,
  sheetPathsByName, formulaOf, colNum, type Sheet,
} from "../lib/xlsx/sheet-xml";

const SRC = resolve(process.argv[2] ?? "C:/Users/junyo/Downloads/공항버스_B800_설치_전개현황_260826.xlsx");
const OUT = resolve("lib/export/templates/v2-master.xlsx");
const DROP_SHEETS = ["거치 유형 및 영수증 보유 현황", "안내"];
const K_TARGET = /\(차량리스트!\$K\$2:\$K\$\d+<>""\)/g;

function retargetFormulas(s: Sheet): void {
  for (const row of s.rows)
    for (const c of row.cells) {
      let f = formulaOf(c);
      if (!f || !/차량리스트!\$K\$2/.test(f)) continue;
      const keepDate = /MIN\(|MAX\(|\$K\$2:\$K\$\d+<=/.test(f);
      f = f.replace(K_TARGET, keepDate ? '(차량리스트!$J$2:$J$2="대상")*(차량리스트!$K$2:$K$2<>"")' : '(차량리스트!$J$2:$J$2="대상")');
      f = f.replace(/SUMPRODUCT\(\(차량리스트!\$K\$2:\$K\$\d+=([^()]*)\)\*1\)/g, 'SUMPRODUCT((차량리스트!$J$2:$J$2="대상")*(차량리스트!$K$2:$K$2=$1))');
      setFormula(s, c.col, row.r, f);
    }
}

/** 착수/종료 예정(MIN·MAX) — 예정일이 하나도 없는 운수사는 99999·0 대신 빈 칸 */
function blankNoDate(s: Sheet): void {
  for (const row of s.rows)
    for (const c of row.cells) {
      const f = formulaOf(c);
      if (!f) continue;
      if (f.startsWith("SUMPRODUCT(MIN(")) setFormula(s, c.col, row.r, `IF(${f}=99999,"",${f})`);
      else if (f.startsWith("SUMPRODUCT(MAX(")) setFormula(s, c.col, row.r, `IF(${f}=0,"",${f})`);
    }
}

function clearBlock(s: Sheet, rows: number[], cols: string[]): void {
  rows.forEach((r, i) => {
    setValue(s, 1, r, i + 1);
    for (const col of cols) setValue(s, colNum(col), r, null);
  });
}

async function main() {
  const zip = await JSZip.loadAsync(readFileSync(SRC));
  let wb = (await zip.file("xl/workbook.xml")!.async("string"));
  let rels = (await zip.file("xl/_rels/workbook.xml.rels")!.async("string"));
  let ct = (await zip.file("[Content_Types].xml")!.async("string"));
  const paths = sheetPathsByName(wb, rels);

  // 1) 프로젝트 전용 시트 제거 (+ 그림·프린터 설정·calcChain·app.xml)
  for (const name of DROP_SHEETS) {
    const path = paths.get(name);
    if (!path) throw new Error(`시트 없음: ${name}`);
    const tag = wb.match(new RegExp(`<sheet [^>]*name="${name}"[^>]*/>`))![0];
    const rid = tag.match(/r:id="([^"]+)"/)![1];
    wb = wb.replace(tag, "");
    rels = rels.replace(new RegExp(`<Relationship [^>]*Id="${rid}"[^>]*/>`), "");
    ct = ct.replace(new RegExp(`<Override PartName="/${path}"[^>]*/>`), "");
    const relPath = path.replace(/worksheets\/(sheet\d+\.xml)$/, "worksheets/_rels/$1.rels");
    const relXml = await zip.file(relPath)?.async("string");
    for (const m of relXml?.matchAll(/Target="\.\.\/([^"]+)"/g) ?? []) {
      const sub = "xl/" + m[1];
      zip.remove(sub);
      ct = ct.replace(new RegExp(`<Override PartName="/${sub.replace(/\./g, "\\.")}"[^>]*/>`), "");
      const subRels = sub.replace(/\/([^/]+)$/, "/_rels/$1.rels");
      const subRelXml = await zip.file(subRels)?.async("string");
      for (const mm of subRelXml?.matchAll(/Target="\.\.\/([^"]+)"/g) ?? []) zip.remove("xl/" + mm[1]);
      zip.remove(subRels);
    }
    zip.remove(relPath);
    zip.remove(path);
  }
  zip.remove("xl/calcChain.xml");
  ct = ct.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, "");
  rels = rels.replace(/<Relationship [^>]*Target="calcChain\.xml"[^>]*\/>/, "");
  zip.remove("docProps/app.xml");
  ct = ct.replace(/<Override PartName="\/docProps\/app\.xml"[^>]*\/>/, "");
  const root = await zip.file("_rels/.rels")!.async("string");
  zip.file("_rels/.rels", root.replace(/<Relationship [^>]*Target="docProps\/app\.xml"[^>]*\/>/, ""));
  wb = wb.replace(/<mc:AlternateContent[\s\S]*?<\/mc:AlternateContent>/, "");
  wb = wb.replace(/<definedName name="_xlnm\._FilterDatabase"[^>]*>[^<]*<\/definedName>/, (m) => m.replace(/>[^<]*</, ">차량리스트!$A$1:$AL$2<"));

  // 2) 시트별 뼈대 정리
  const load = async (name: string) => parseSheet(await zip.file(paths.get(name)!)!.async("string"), name);
  const save = (s: Sheet) => {
    stripFormulaValues(s);
    let xml = serializeSheet(s);
    xml = xml.replace(/안내!\$C\$6/g, "'설치 진행현황'!$K$1");
    xml = xml.replace(/(차량리스트!\$[A-Z]{1,3}\$2:\$[A-Z]{1,3}\$)\d+/g, "$12");
    zip.file(paths.get(s.name)!, xml);
  };

  for (const prefix of ["실사", "설치"] as const) {
    const prog = await load(`${prefix} 진행현황`);
    materializeShared(prog);
    deleteRows(prog, 14, 15); // 운수사 4행 → 2행(12·13), 합계 14
    clearBlock(prog, [12, 13], ["B", "C", "M"]);
    setFormula(prog, colNum("K"), 1, prefix === "설치" ? "TODAY()" : "'설치 진행현황'!$K$1");
    if (prefix === "설치") retargetFormulas(prog);
    blankNoDate(prog);
    save(prog);

    const sched = await load(`${prefix} 전개일정`);
    materializeShared(sched);
    const lastCol = Math.max(...sched.rows.flatMap((r) => r.cells.map((c) => c.col)));
    deleteCols(sched, colNum("K"), lastCol); // 날짜 열 쌍 → G/H·I/J 2쌍
    deleteRows(sched, 11, 12); // 운수사 4행 → 2행(9·10), 합계 11, 누적 12
    clearBlock(sched, [9, 10], ["B", "C"]);
    setValue(sched, colNum("G"), 6, null); // 날짜는 런타임이 값으로 넣는다
    setValue(sched, colNum("I"), 6, null);
    if (prefix === "설치") retargetFormulas(sched);
    save(sched);

    const daily = await load(`${prefix} 일자별 현황`);
    materializeShared(daily);
    const total = Math.max(...daily.rows.map((r) => r.r)); // 합계 행
    deleteRows(daily, 8, total - 1); // 날짜 행 → 2행(6·7), 합계 8
    for (const r of [6, 7]) {
      setValue(daily, 1, r, r - 5);
      daily.rows.find((x) => x.r === r)!.attrs = daily.rows.find((x) => x.r === r)!.attrs.replace(/ hidden="1"/, "");
    }
    if (prefix === "설치") retargetFormulas(daily);
    save(daily);
  }

  const veh = await load("차량리스트");
  const last = Math.max(...veh.rows.map((r) => r.r));
  deleteRows(veh, 3, last);
  for (const c of veh.rows.find((r) => r.r === 2)!.cells) setValue(veh, c.col, 2, null);
  save(veh);

  zip.file("xl/workbook.xml", wb);
  zip.file("xl/_rels/workbook.xml.rels", rels);
  zip.file("[Content_Types].xml", ct);
  mkdirSync(dirname(OUT), { recursive: true });
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  writeFileSync(OUT, buf);
  console.log(`✅ ${OUT} (${(buf.length / 1024).toFixed(0)} KB) — 시트: ${[...sheetPathsByName(wb, rels).keys()].join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
