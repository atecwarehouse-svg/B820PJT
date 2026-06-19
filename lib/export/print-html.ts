// 인쇄/PDF 공용 HTML 생성기.
// 차량당 A4 1페이지(목록 + 설치 전 + 설치 후)에 모두 담고,
// 다중 차량은 차량마다 페이지 분할(차량당 1페이지)한다.
// 화면 인쇄 페이지(app/print)와 서버 PDF 라우트(api/export/pdf)가 동일 마크업을 공유.

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
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Malgun Gothic','맑은 고딕','Noto Sans KR',sans-serif; color:#000; }
  /* 첫 페이지 제외하고 각 차량 앞에서 페이지 분할 (마지막 뒤 빈 페이지 방지) */
  .page { width: 194mm; margin: 0 auto; page-break-before: always; break-before: page; }
  .page:first-child { page-break-before: avoid; break-before: avoid; }
  .doc-title { text-align:center; font-size:16px; font-weight:700; margin:2px 0 6px; }
  table.info { width:100%; border-collapse:collapse; margin-bottom:6px; }
  table.info th, table.info td { border:1px solid #000; padding:3px 5px; font-size:11px; }
  table.info th { background:#f2f2f2; width:13%; text-align:center; white-space:nowrap; }
  table.info td { width:37%; text-align:center; }
  .section-head { background:#d9d9d9; border:1px solid #000; font-weight:700; font-size:12px; padding:2px 6px; margin-top:4px; }
  .grid { display:grid; grid-template-columns:1fr 1fr 1fr; }
  .cell { border:1px solid #000; border-top:none; }
  .cell:nth-child(3n+2), .cell:nth-child(3n) { border-left:none; }
  .cell-label { text-align:center; font-size:10px; font-weight:700; background:#f2f2f2; border-bottom:1px solid #000; padding:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cell-photo { height:33mm; display:flex; align-items:center; justify-content:center; overflow:hidden; }
  .cell-photo img { width:100%; height:100%; object-fit:cover; }
  .cell-photo .empty { color:#999; font-size:10px; }
  .grid, .cell { break-inside: avoid; }
`;

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 차량 한 대의 내부 마크업(페이지 래퍼 제외)
function bodyInner(data: PrintData): string {
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

  return info + sections;
}

// 차량 한 대 = 페이지 1개 래퍼
export function buildPrintBodyHtml(data: PrintData): string {
  return `<div class="page">${bodyInner(data)}</div>`;
}

// 다중 차량 — 각 차량을 한 페이지씩
export function buildMultiBodyHtml(items: PrintData[]): string {
  return items.map((d) => `<div class="page">${bodyInner(d)}</div>`).join("");
}

export function buildMultiDocument(items: PrintData[]): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
  <style>${PRINT_CSS}</style></head>
  <body>${buildMultiBodyHtml(items)}</body></html>`;
}

export function buildPrintDocument(data: PrintData): string {
  return buildMultiDocument([data]);
}
