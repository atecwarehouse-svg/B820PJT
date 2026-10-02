import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_SLUG } from "@/lib/project";
import { TEMPLATE_BUCKET, templateObject } from "@/lib/template-path";
import { parsePeriod } from "@/lib/settings";
import { resolveSheetPaths, setCellNumber } from "@/lib/export/fill-progress-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/import/schedule/template?name=<프로젝트명>&start=YYYY-MM-DD&end=YYYY-MM-DD → 로우데이터 빈 양식(xlsx) 다운로드.
// B820 진행현황 양식(Storage templates/progress-template.xlsx)을 바탕으로 zip 셀 수술만 한다
// (수식·서식·병합·피벗은 그대로 — 행을 지우면 SUM 범위·공유수식이 깨지므로 행은 남기고 값만 비운다).
//   차량리스트 : 1행 제목줄(E1=설치 장소) + 2행 작성 예시(차량번호 "예)…"는 업로드 파서가 건너뜀), 나머지 행 삭제
//   전개일정   : A1 제목=(프로젝트명) 전개일정, 3행 날짜=start~end 하루씩(최대 61칸, 없으면 H3 예시 날짜만),
//                5행 예시(○○교통/5311), 6~341행 값 비움·수식 유지 (운수사·노선·차고지·대상수량은 업로드 때 차량리스트로 자동 채움)
//   진행현황   : A1 제목=(프로젝트명) 진행현황, A10 기준일=다운로드 당일(KST),
//                12~348행 A(NO)·B(영업소)·C(노선)·D(대상대수)는 같은 행의 전개일정(A/B/E) 참조 수식
//                → 전개일정에 운수사·노선을 적는 만큼 진행현황 행이 따라 채워진다(빈 행은 공란)
//   workbook   : fullCalcOnLoad — 열 때 수식 재계산(캐시값은 지움), 진행현황 탭 이름=(프로젝트명) 진행현황
// 그래서 이 파일을 채워 올리면 진행현황 다운로드 양식으로도 저장된다. Storage를 못 읽으면 차량리스트만 있는 간단 양식.

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXAMPLE_DATE = Date.UTC(2026, 9, 15);
const excelSerial = (ms: number) => Math.round((ms - Date.UTC(1899, 11, 30)) / 86400000);
const EX_OP = "○○교통";
const EX_ROUTE = "5311";
const EX_DEPOT = "○○차고지";

// 차량리스트 2행 예시 — 열 위치는 lib/import/parse-schedule.ts 가 읽는 자리
const VEHICLE_EXAMPLE: Record<string, string | number> = {
  A: 1, B: EX_OP, C: EX_ROUTE, D: EX_DEPOT, E: "인천 서구 ○○동 123", F: "예) 인천70바4005",
  I: excelSerial(EXAMPLE_DATE), J: 2023, L: "유니버스 수소", U: "○○전자",
};
// 전개일정 5행 예시 — A 운수사·B 노선·C/E 대상수량·D 차고지·H 첫 날짜 계획
const SCHEDULE_EXAMPLE: Record<string, string | number> = { A: EX_OP, B: EX_ROUTE, C: 1, D: EX_DEPOT, E: 1, H: 1 };
// 오늘(KST) Excel 직렬값 — 진행현황 A10 기준일
const todaySerial = () => Math.floor((Date.now() + 9 * 3600000) / 86400000) + 25569;
// "YYYY-MM-DD" 시작~종료(포함) 하루 간격 Excel 직렬값 목록 — 전개일정 3행 날짜
function dateSerials(start: string, end: string): number[] {
  const ser = (s: string) => excelSerial(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))));
  const out: number[] = [];
  for (let d = ser(start); d <= ser(end); d++) out.push(d);
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CELL_RE = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const styleOf = (attrs: string) => (attrs.match(/\bs="(\d+)"/) || [])[1];
const sAttr = (s?: string) => (s ? ` s="${s}"` : "");

function valueCell(ref: string, s: string | undefined, v: string | number): string {
  return typeof v === "number"
    ? `<c r="${ref}"${sAttr(s)}><v>${v}</v></c>`
    : `<c r="${ref}"${sAttr(s)} t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
}

/** 셀 하나를 '빈 양식' 셀로: 수식은 유지(캐시값 제거), 값 셀은 example에 있으면 그 값, 없으면 빈 셀(서식 유지) */
function blankCell(col: string, row: string, attrs: string, inner: string | undefined, example: Record<string, string | number>): string {
  const ref = `${col}${row}`;
  const s = styleOf(attrs);
  const f = inner?.match(/<f\b[^>]*(?:\/>|>[\s\S]*?<\/f>)/)?.[0];
  if (f) return `<c r="${ref}"${sAttr(s)}>${f}</c>`;
  const v = example[col];
  return v === undefined ? `<c r="${ref}"${sAttr(s)}/>` : valueCell(ref, s, v);
}

/** 시트 XML의 rows[from..to] 값 비우기 (exampleRow 행에는 example 값) */
function blankRows(xml: string, from: number, to: number, exampleRow: number, example: Record<string, string | number>): string {
  return xml.replace(/<row r="(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, (whole, rnStr: string, rowAttrs: string, inner?: string) => {
    const rn = Number(rnStr);
    if (rn < from || rn > to || inner === undefined) return whole;
    const ex = rn === exampleRow ? example : {};
    const cells = inner.replace(CELL_RE, (_c, col: string, row: string, attrs: string, cin?: string) => blankCell(col, row, attrs, cin, ex));
    return `<row r="${rn}"${rowAttrs}>${cells}</row>`;
  });
}

/** A{row} 제목 셀을 inline 문자열로 교체 */
function setTitle(xml: string, ref: string, text: string): string {
  return xml.replace(new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`), (_m, attrs: string) => valueCell(ref, styleOf(attrs), text));
}

// 템플릿 캐시 — 4MB 파일을 요청마다 받지 않도록 10분 보관
let cache: { at: number; buf: Buffer } | null = null;

async function loadB820Template(): Promise<Buffer | null> {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.buf;
  try {
    const { data, error } = await createServiceClient(DEFAULT_SLUG)
      .storage.from(TEMPLATE_BUCKET)
      .download(templateObject(DEFAULT_SLUG));
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    cache = { at: Date.now(), buf };
    return buf;
  } catch {
    return null;
  }
}

/** B820 양식 → 빈 양식. 구조가 예상과 다르면 null. period: 프로젝트 기간(전개일정 3행 날짜) */
async function blankFromTemplate(src: Buffer, projectName: string, period: { start: string; end: string } | null): Promise<Buffer | null> {
  const zip = await JSZip.loadAsync(src);
  const paths = await resolveSheetPaths(zip);
  const vFile = zip.file(paths.vehicle);
  const sFile = zip.file(paths.schedule);
  const pFile = zip.file(paths.progress);
  const wbFile = zip.file("xl/workbook.xml");
  if (!vFile || !sFile || !pFile || !wbFile) return null;

  // ── 차량리스트: 1행 + 예시 2행만 남긴다 ──
  let vx = await vFile.async("string");
  const open = vx.indexOf("<sheetData>");
  const close = vx.indexOf("</sheetData>");
  if (open < 0 || close < 0) return null;
  const rows = vx.slice(open + "<sheetData>".length, close).match(/<row r="\d+"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g);
  if (!rows || rows.length < 2 || !rows[0].startsWith('<row r="1"')) return null;
  let header = rows[0];
  const e1 = header.match(/<c r="E1"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/);
  if (e1) header = header.replace(e1[0], valueCell("E1", styleOf(e1[1]), "설치 장소"));
  const src2 = rows.find((r) => r.startsWith('<row r="2"')) ?? rows[1];
  const rowAttrs = (src2.match(/^<row r="\d+"([^>]*?)\/?>/) || ["", ""])[1].replace(/\s*\/$/, "");
  const cells: string[] = [];
  for (const m of src2.matchAll(CELL_RE)) {
    const v = VEHICLE_EXAMPLE[m[1]];
    const s = styleOf(m[3]);
    cells.push(v === undefined ? `<c r="${m[1]}2"${sAttr(s)}/>` : valueCell(`${m[1]}2`, s, v));
  }
  if (!cells.some((c) => c.startsWith('<c r="F2"'))) return null;
  vx = vx.slice(0, open) + "<sheetData>" + header + `<row r="2"${rowAttrs}>${cells.join("")}</row>` + vx.slice(close);
  vx = vx.replace(/<dimension ref="A1:([A-Z]+)\d+"\/>/, '<dimension ref="A1:$12"/>');
  vx = vx.replace(/<autoFilter ref="A1:([A-Z]+)\d+"/, '<autoFilter ref="A1:$12"');
  zip.file(paths.vehicle, vx);

  // ── 전개일정: 제목, 3행 날짜(프로젝트 기간이면 시작일부터 하루씩, 없으면 H3만 예시 날짜), 5행 예시, 6행~합계 전 행 비움 ──
  //    날짜 칸 = 원본 3행에서 값이 들어 있던 셀(H·J·L… 격열 61개, 완료 열 I·K…는 비어 있음). 칸보다 긴 기간은 잘린다.
  let sx = await sFile.async("string");
  const sTotal = findTotalRow(sx, 5); // "합계" 행(A열 공유문자열은 못 읽으니 SUM(E5:E…) 수식으로 찾는다)
  sx = setTitle(sx, "A1", `${projectName} 전개일정`);
  const dates = period ? dateSerials(period.start, period.end) : [excelSerial(EXAMPLE_DATE)];
  let slot = 0;
  sx = sx.replace(/<row r="3"([^>]*?)>([\s\S]*?)<\/row>/, (_m, attrs: string, inner: string) => {
    const cells = inner.replace(CELL_RE, (c, col: string, row: string, cattrs: string, cin?: string) => {
      if (col.length === 1 && col < "H") return c; // A~G는 라벨·수식 그대로
      const isDateSlot = !!cin && /<v>/.test(cin) && !/<f\b/.test(cin);
      const v = isDateSlot ? dates[slot++] : undefined;
      return blankCell(col, row, cattrs, cin, v === undefined ? {} : { [col]: v });
    });
    return `<row r="3"${attrs}>${cells}</row>`;
  });
  sx = blankRows(sx, 5, sTotal - 1, 5, SCHEDULE_EXAMPLE);
  zip.file(paths.schedule, sx);

  // ── 진행현황: 제목, A10 기준일=오늘, 12행~합계 전 행 값 비움 + A/B/C/D는 전개일정 참조 수식 ──
  let px = await pFile.async("string");
  const pTotal = findTotalRow(px, 12);
  px = setTitle(px, "A1", `${projectName} 진행현황`);
  px = setCellNumber(px, "A10", todaySerial());
  px = blankRows(px, 12, pTotal - 1, 0, {});
  px = px.replace(/<row r="(\d+)"([^>]*?)>([\s\S]*?)<\/row>/g, (whole, rnStr: string, attrs: string, inner: string) => {
    const rn = Number(rnStr);
    // 같은 행의 F열 수식(전개일정!F{n})에서 전개일정 행 번호를 읽는다 — 행 오프셋을 상수로 두지 않음
    const sr = rn >= 12 && rn < pTotal ? inner.match(/전개일정!F(\d+)/)?.[1] : undefined;
    if (!sr) return whole;
    const f: Record<string, string> = {
      A: `IF(전개일정!A${sr}="","",ROW()-11)`,
      B: `IF(전개일정!A${sr}="","",전개일정!A${sr})`,
      C: `IF(전개일정!B${sr}="","",전개일정!B${sr})`,
      D: `전개일정!E${sr}`, // 다운로드 보정(fill-progress-xlsx)이 이 참조를 읽어 Δ를 더한다
    };
    const cells = inner.replace(CELL_RE, (c, col: string, row: string, cattrs: string) =>
      f[col] ? `<c r="${col}${row}"${sAttr(styleOf(cattrs))}><f>${f[col]}</f></c>` : c);
    return `<row r="${rn}"${attrs}>${cells}</row>`;
  });
  zip.file(paths.progress, px);

  // ── 열 때 전부 재계산 (캐시값을 지웠으므로) ──
  let wx = await wbFile.async("string");
  wx = /<calcPr\b/.test(wx)
    ? wx.replace(/<calcPr\b([^>]*?)\/?>/, (m, attrs: string) => (/fullCalcOnLoad=/.test(attrs) ? m : `<calcPr${attrs} fullCalcOnLoad="1"${m.endsWith("/>") ? "/>" : ">"}`))
    : wx.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
  // 진행현황 시트 탭 이름도 "(프로젝트명) 진행현황" — 다른 시트 수식이 이 이름을 참조하지 않아 안전 (31자·금지문자 제한)
  const tab = `${projectName} 진행현황`.replace(/[[\]:*?\/\\]/g, " ").slice(0, 31);
  wx = wx.replace(/<sheet name="[^"]*진행현황[^"]*"/, `<sheet name="${esc(tab)}"`);
  zip.file("xl/workbook.xml", wx);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** 합계 행 번호 — E열 또는 D열에 SUM(?from:?…) 수식이 있는 첫 행. 못 찾으면 마지막 행+1 */
function findTotalRow(xml: string, from: number): number {
  const m = xml.match(new RegExp(`<c r="[DE](\\d+)"[^>]*><f>SUM\\([DE]${from}:[DE]\\d+\\)</f>`));
  if (m) return Number(m[1]);
  const last = [...xml.matchAll(/<row r="(\d+)"/g)].map((r) => Number(r[1]));
  return (last.length ? Math.max(...last) : from) + 1;
}

/** 폴백 — 차량리스트 시트만 있는 간단한 양식 */
async function simpleBlank(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("차량리스트");
  const headers: Record<string, string> = {
    A: "번호", B: "운수사", C: "노선", D: "차고지", E: "설치 장소", F: "차량번호", G: "완료여부", H: "완료일",
    I: "설치 예정일", J: "연식", L: "모델명", U: "타코 제조사",
  };
  for (const [col, name] of Object.entries(headers)) {
    const cell = ws.getCell(`${col}1`);
    cell.value = name;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.alignment = { horizontal: "center" };
  }
  for (const [col, v] of Object.entries(VEHICLE_EXAMPLE)) {
    const cell = ws.getCell(`${col}2`);
    cell.value = col === "I" ? new Date(EXAMPLE_DATE) : v;
    cell.font = { color: { argb: "FF9CA3AF" }, italic: true };
  }
  ws.getColumn("I").numFmt = "yyyy-mm-dd";
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const projectName = (q.get("name") ?? "").trim().slice(0, 40) || "(프로젝트명)";
  const period = parsePeriod({ start: q.get("start"), end: q.get("end") }); // 잘못되면 null → 예시 날짜
  let buf: Buffer | null = null;
  let full = false;
  const src = await loadB820Template();
  if (src) {
    try {
      buf = await blankFromTemplate(src, projectName, period);
      full = !!buf;
    } catch (e) {
      console.warn("[template] 양식 비우기 실패 — 간단 양식으로 대체:", e instanceof Error ? e.message : e);
    }
  }
  if (!buf) buf = await simpleBlank();
  const filename = full ? `${projectName} 진행현황_빈양식.xlsx` : "차량리스트_빈양식.xlsx";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="raw_template.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "X-Template-Full": full ? "1" : "0",
    },
  });
}
