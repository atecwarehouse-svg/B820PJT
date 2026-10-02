// 빈 양식의 「작성 안내」 시트 — 빈 양식 다운로드 때 맨 앞에 넣고(addGuideSheet),
// 업로드해서 다운로드 양식(템플릿)으로 저장할 때 뺀다(removeGuideSheet).
// 이 파일은 진행현황 다운로드·리포트 메일 첨부의 원본이 되므로 안내 시트가 남으면 안 된다.
//
// zip 셀 수술: workbook.xml <sheets>·definedName localSheetId(시트 순서 번호)·activeTab,
// workbook.xml.rels, [Content_Types].xml, styles.xml(글꼴·채움·xf 추가)을 함께 고친다.

import JSZip from "jszip";

export const GUIDE_SHEET = "작성 안내";

export type GuideStyle = "title" | "head" | "th" | "note" | "body";
export interface GuideRow {
  s?: GuideStyle; // 행 전체 셀 스타일 (기본 body)
  cells: string[]; // A, B, C, D … 순서
}

const WB = "xl/workbook.xml";
const RELS = "xl/_rels/workbook.xml.rels";
const CT = "[Content_Types].xml";
const COLS = "ABCDEFGH";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const read = async (zip: JSZip, path: string) => (await zip.file(path)?.async("string")) ?? null;

// localSheetId가 at 이상인 것을 delta만큼 민다
const shiftLocalIds = (wb: string, at: number, delta: number) =>
  wb.replace(/localSheetId="(\d+)"/g, (m, n: string) => (Number(n) >= at ? `localSheetId="${Number(n) + delta}"` : m));

/** styles.xml에 안내 시트용 글꼴·채움·xf를 덧붙이고 스타일 인덱스를 돌려준다. 구조가 다르면 null(무서식). */
function addStyles(styles: string): { xml: string; idx: Record<GuideStyle, number> } | null {
  const fonts = styles.match(/<fonts count="(\d+)"([^>]*)>([\s\S]*?)<\/fonts>/);
  const fills = styles.match(/<fills count="(\d+)">([\s\S]*?)<\/fills>/);
  const xfs = styles.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
  if (!fonts || !fills || !xfs) return null;
  const f0 = Number(fonts[1]);
  const newFonts = [
    '<font><b/><sz val="16"/><color theme="1"/><name val="맑은 고딕"/><family val="2"/><charset val="129"/></font>', // title
    '<font><b/><sz val="12"/><color rgb="FF1D4ED8"/><name val="맑은 고딕"/><family val="2"/><charset val="129"/></font>', // head
    '<font><b/><sz val="11"/><color theme="1"/><name val="맑은 고딕"/><family val="2"/><charset val="129"/></font>', // th
    '<font><sz val="10"/><color rgb="FF6B7280"/><name val="맑은 고딕"/><family val="2"/><charset val="129"/></font>', // note
    '<font><sz val="11"/><color theme="1"/><name val="맑은 고딕"/><family val="2"/><charset val="129"/></font>', // body
  ];
  const fillId = Number(fills[1]);
  const x0 = Number(xfs[1]);
  const xf = (font: number, fill = 0) =>
    `<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="0" xfId="0" applyFont="1"${fill ? ' applyFill="1"' : ""} applyAlignment="1"><alignment vertical="center"/></xf>`;
  const newXfs = [xf(f0), xf(f0 + 1), xf(f0 + 2, fillId), xf(f0 + 3), xf(f0 + 4)];
  const xml = styles
    .replace(fonts[0], `<fonts count="${f0 + newFonts.length}"${fonts[2]}>${fonts[3]}${newFonts.join("")}</fonts>`)
    .replace(
      fills[0],
      `<fills count="${fillId + 1}">${fills[2]}<fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill></fills>`,
    )
    .replace(xfs[0], `<cellXfs count="${x0 + newXfs.length}">${xfs[2]}${newXfs.join("")}</cellXfs>`);
  return { xml, idx: { title: x0, head: x0 + 1, th: x0 + 2, note: x0 + 3, body: x0 + 4 } };
}

/** 안내 시트를 맨 앞 탭으로 추가하고 열었을 때 이 시트가 보이게 한다. 실패하면 false(양식은 그대로). */
export async function addGuideSheet(zip: JSZip, rows: GuideRow[], widths: number[]): Promise<boolean> {
  const [wb, rels, ct, styles] = await Promise.all([read(zip, WB), read(zip, RELS), read(zip, CT), read(zip, "xl/styles.xml")]);
  if (!wb || !rels || !ct || !styles || !/<sheets>/.test(wb)) return false;
  const st = addStyles(styles);

  const sheetNo = Math.max(0, ...Object.keys(zip.files).map((p) => Number(p.match(/^xl\/worksheets\/sheet(\d+)\.xml$/)?.[1] ?? 0))) + 1;
  const rid = `rId${Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]))) + 1}`;
  const sheetId = Math.max(0, ...[...wb.matchAll(/<sheet\b[^>]*sheetId="(\d+)"/g)].map((m) => Number(m[1]))) + 1;

  const rowsXml = rows
    .map((r, i) => {
      const s = st ? ` s="${st.idx[r.s ?? "body"]}"` : "";
      const ht = r.s === "title" ? ' ht="30" customHeight="1"' : r.s === "th" ? ' ht="20" customHeight="1"' : "";
      const cells = r.cells
        .map((t, c) => (t ? `<c r="${COLS[c]}${i + 1}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(t)}</t></is></c>` : r.s === "th" ? `<c r="${COLS[c]}${i + 1}"${s}/>` : ""))
        .join("");
      return `<row r="${i + 1}"${ht}>${cells}</row>`;
    })
    .join("");
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  zip.file(
    `xl/worksheets/sheet${sheetNo}.xml`,
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheetPr><tabColor rgb="FF10B981"/></sheetPr>' +
      '<sheetViews><sheetView tabSelected="1" showGridLines="0" workbookViewId="0"/></sheetViews>' +
      `<sheetFormatPr defaultRowHeight="18"/><cols>${cols}</cols><sheetData>${rowsXml}</sheetData>` +
      '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>',
  );

  // 다른 시트의 '선택된 탭' 표시 해제 — 둘 이상이면 시트가 그룹으로 묶인 채 열린다
  for (const p of Object.keys(zip.files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(p) || p === `xl/worksheets/sheet${sheetNo}.xml`) continue;
    const x = await zip.file(p)!.async("string");
    if (/ tabSelected="1"/.test(x)) zip.file(p, x.replace(/ tabSelected="1"/g, ""));
  }

  let w = wb.replace("<sheets>", `<sheets><sheet name="${GUIDE_SHEET}" sheetId="${sheetId}" r:id="${rid}"/>`);
  w = shiftLocalIds(w, 0, 1);
  w = /activeTab="\d+"/.test(w) ? w.replace(/activeTab="\d+"/, 'activeTab="0"') : w;
  zip.file(WB, w);
  zip.file(
    RELS,
    rels.replace(
      "</Relationships>",
      `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheetNo}.xml"/></Relationships>`,
    ),
  );
  zip.file(
    CT,
    ct.replace(
      "</Types>",
      `<Override PartName="/xl/worksheets/sheet${sheetNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
  );
  if (st) zip.file("xl/styles.xml", st.xml);
  return true;
}

/** 안내 시트가 있으면 뺀다. 뺐으면 true. (덧붙인 스타일은 남아도 무해해 그대로 둔다) */
export async function removeGuideSheet(zip: JSZip): Promise<boolean> {
  const [wb, rels, ct] = await Promise.all([read(zip, WB), read(zip, RELS), read(zip, CT)]);
  if (!wb || !rels || !ct) return false;
  const tags = [...wb.matchAll(/<sheet\b[^>]*\/>/g)].map((m) => m[0]);
  const at = tags.findIndex((t) => t.includes(`name="${GUIDE_SHEET}"`));
  if (at < 0) return false;
  const rid = tags[at].match(/r:id="([^"]+)"/)?.[1];
  const rel = rid ? rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*/>`))?.[0] : undefined;
  const target = rel?.match(/Target="([^"]+)"/)?.[1];

  let w = wb.replace(tags[at], "");
  w = w.replace(new RegExp(`<definedName\\b[^>]*localSheetId="${at}"[^>]*>[\\s\\S]*?</definedName>`, "g"), "");
  w = shiftLocalIds(w, at + 1, -1);
  // 남은 첫 '보이는' 시트를 활성 탭으로
  const left = tags.filter((_, i) => i !== at);
  const firstVisible = Math.max(0, left.findIndex((t) => !/state="(hidden|veryHidden)"/.test(t)));
  w = w.replace(/activeTab="\d+"/, `activeTab="${firstVisible}"`);
  zip.file(WB, w);
  if (rel) zip.file(RELS, rels.replace(rel, ""));
  if (target) {
    const path = "xl/" + target.replace(/^\/?xl\//, "");
    zip.remove(path);
    zip.remove(path.replace(/worksheets\/(sheet\d+\.xml)$/, "worksheets/_rels/$1.rels"));
    zip.file(CT, ct.replace(new RegExp(`<Override[^>]*PartName="/${path.replace(/\./g, "\\.")}"[^>]*/>`), ""));
  }
  return true;
}
