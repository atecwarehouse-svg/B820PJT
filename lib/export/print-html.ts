// 인쇄/PDF 공용 HTML 생성기.
// 화면 인쇄 페이지(app/print)와 서버 PDF 라우트(api/export/pdf)가 동일 마크업을 공유한다.

export interface PrintSlot {
  label: string;
  url: string | null;
}
export interface PrintSection {
  title: string;
  slots: PrintSlot[];
}
export interface PrintData {
  plate: string;
  installDate: string;
  operator: string;
  route: string;
  year: string;
  model: string;
  sections: PrintSection[];
}

export const PRINT_CSS = `
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  .print-root { width: 190mm; margin: 0 auto; font-family: 'Malgun Gothic','맑은 고딕','Noto Sans KR',sans-serif; color:#000; }
  .doc-title { text-align:center; font-size:18px; font-weight:700; margin:4px 0 8px; }
  table.info { width:100%; border-collapse:collapse; margin-bottom:8px; }
  table.info th, table.info td { border:1px solid #000; padding:4px 6px; font-size:12px; }
  table.info th { background:#f2f2f2; width:14%; text-align:center; white-space:nowrap; }
  table.info td { width:36%; text-align:center; }
  .section-head { background:#d9d9d9; border:1px solid #000; font-weight:700; font-size:13px; padding:3px 6px; margin-top:6px; }
  .grid { display:grid; grid-template-columns:1fr 1fr 1fr; }
  .cell { border:1px solid #000; border-top:none; }
  .cell:nth-child(3n+2), .cell:nth-child(3n) { border-left:none; }
  .cell-label { text-align:center; font-size:11px; font-weight:700; background:#f2f2f2; border-bottom:1px solid #000; padding:2px; }
  .cell-photo { aspect-ratio: 3 / 2; display:flex; align-items:center; justify-content:center; overflow:hidden; }
  .cell-photo img { width:100%; height:100%; object-fit:cover; }
  .cell-photo .empty { color:#999; font-size:11px; }
  .grid, .cell { break-inside: avoid; }
`;

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPrintBodyHtml(data: PrintData): string {
  const info = `
    <h1 class="doc-title">B820 설치 사진</h1>
    <table class="info"><tbody>
      <tr><th>설치일자</th><td>${esc(data.installDate)}</td><th>차량NO</th><td>${esc(data.plate)}</td></tr>
      <tr><th>운수사</th><td>${esc(data.operator)}</td><th>노선</th><td>${esc(data.route)}</td></tr>
      <tr><th>연식</th><td>${esc(data.year)}</td><th>차종</th><td>${esc(data.model)}</td></tr>
    </tbody></table>`;

  const sections = data.sections
    .map((sec) => {
      const cells = sec.slots
        .map(
          (s) => `
        <div class="cell">
          <div class="cell-label">${esc(s.label)}</div>
          <div class="cell-photo">${
            s.url
              ? `<img src="${esc(s.url)}" alt="${esc(s.label)}" />`
              : `<span class="empty">사진 없음</span>`
          }</div>
        </div>`,
        )
        .join("");
      return `<div class="section-head">${esc(sec.title)}</div><div class="grid">${cells}</div>`;
    })
    .join("");

  return `<div class="print-root">${info}${sections}</div>`;
}

export function buildPrintDocument(data: PrintData): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
  <style>${PRINT_CSS}</style></head>
  <body>${buildPrintBodyHtml(data)}</body></html>`;
}
