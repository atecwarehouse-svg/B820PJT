// 안전관리 서약서 PDF용 HTML 생성기.
// 워드 양식(인천버스 단말기 설치 안전관리 서약서.docx, 2페이지)과 동일한 구성:
//  - 1페이지: 제목 + 정보표 + [교육내용] 1~8
//  - 2페이지: 일자/설치시간 + 작업 전·후 서명표(입력 순서) + 하단 서약 문구
// print-html.ts 와 동일하게 Pretendard 폰트를 base64 로 임베드해 서버리스에서도 한글 렌더 보장.

import { PRETENDARD_WOFF2_BASE64 } from "./pretendard-font";

export interface PledgeSessionData {
  manager_name: string;
  manager_sig: string | null; // 안전관리자 서명 PNG data URL
  operator: string | null;
  location: string | null;
  install_date: string;
  work_content: string;
  quantity: string | null;
  start_time: string | null;
  end_time: string | null;
}

export interface PledgeSignatureData {
  worker_name: string;
  sig_before: string | null; // PNG data URL
  sig_after: string | null; // PNG data URL
}

import type { PledgeTemplate } from "@/lib/pledge-template";

const CSS = `
  @font-face {
    font-family: 'Pretendard';
    src: url('data:font/woff2;base64,${PRETENDARD_WOFF2_BASE64}') format('woff2');
    font-weight: 400 700;
    font-style: normal;
    font-display: block;
  }
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Pretendard','Malgun Gothic','맑은 고딕','Noto Sans KR',sans-serif; color:#000; }
  .page { width: 186mm; margin: 0 auto; page-break-before: always; break-before: page; }
  .page:first-child { page-break-before: avoid; break-before: avoid; }
  .doc-title { text-align:center; font-size:20px; font-weight:700; margin:0 0 14px; letter-spacing:1px; }
  table.info { width:100%; border-collapse:collapse; margin-bottom:12px; }
  table.info th, table.info td { border:1px solid #000; padding:5px 8px; font-size:12px; }
  table.info th { background:#f2f2f2; width:24%; text-align:center; white-space:nowrap; }
  table.info td { text-align:left; }
  .mgr-sig { height:12mm; max-width:45mm; object-fit:contain; vertical-align:middle; }
  .edu-head { font-size:13px; font-weight:700; margin:10px 0 6px; }
  ol.edu { margin:0; padding-left:20px; }
  ol.edu li { font-size:11.5px; line-height:1.7; margin-bottom:3px; }
  .sub-info { width:100%; border-collapse:collapse; margin:6px 0 10px; }
  .sub-info td { font-size:12px; padding:2px 0; }
  table.sig { width:100%; border-collapse:collapse; table-layout:fixed; }
  table.sig th, table.sig td { border:1px solid #000; font-size:11px; text-align:center; }
  table.sig th { background:#f2f2f2; padding:5px 2px; font-weight:700; }
  table.sig td { height:16mm; padding:1px; }
  table.sig col.c-name { width:22%; }
  table.sig col.c-sig { width:28%; }
  .sig-img { max-width:100%; max-height:15mm; object-fit:contain; vertical-align:middle; }
  .name-cell { font-size:12px; }
  .pledge-foot { margin-top:14px; font-size:12px; line-height:1.8; text-align:center; font-weight:500; }
`;

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page1(s: PledgeSessionData, title: string, tpl: PledgeTemplate): string {
  const info = `
    <table class="info"><tbody>
      <tr><th>작 업 내 용</th><td colspan="3">${esc(s.work_content)}</td></tr>
      <tr><th>수      량</th><td>${esc(s.quantity)}</td><th>일      자</th><td>${esc(s.install_date)}</td></tr>
      <tr><th>운  수  사</th><td>${esc(s.operator)}</td><th>장      소</th><td>${esc(s.location)}</td></tr>
      <tr><th>안전관리 담당자</th><td colspan="3">${esc(s.manager_name)}</td></tr>
      <tr><th>회 사 명</th><td>${esc(tpl.company)}</td><th>이 름 / 서 명</th><td>${esc(s.manager_name)} ${
        s.manager_sig
          ? `<img class="mgr-sig" src="${esc(s.manager_sig)}" alt="서명" />`
          : ""
      }</td></tr>
    </tbody></table>`;

  const edu = `
    <div class="edu-head">[교육내용]</div>
    <ol class="edu">
      ${tpl.eduItems.map((t) => `<li>${esc(t)}</li>`).join("")}
    </ol>`;

  return `<div class="page">
    <h1 class="doc-title">${esc(title)}</h1>
    ${info}
    ${edu}
  </div>`;
}

function page2(s: PledgeSessionData, rows: PledgeSignatureData[], tpl: PledgeTemplate): string {
  const sigCell = (url: string | null) =>
    url ? `<img class="sig-img" src="${esc(url)}" alt="서명" />` : "";

  const body =
    rows.length > 0
      ? rows
          .map(
            (r) => `
        <tr>
          <td class="name-cell">${esc(r.worker_name)}</td>
          <td>${sigCell(r.sig_before)}</td>
          <td class="name-cell">${r.sig_after ? esc(r.worker_name) : ""}</td>
          <td>${sigCell(r.sig_after)}</td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="4" style="height:20mm; color:#999;">서명 없음</td></tr>`;

  return `<div class="page">
    <table class="sub-info"><tbody>
      <tr><td>일자 : ${esc(s.install_date)}</td></tr>
      <tr><td>설치시간 : ${esc(s.start_time)}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;종료시간 : ${esc(s.end_time)}</td></tr>
    </tbody></table>
    <table class="sig">
      <colgroup>
        <col class="c-name" /><col class="c-sig" /><col class="c-name" /><col class="c-sig" />
      </colgroup>
      <thead>
        <tr><th colspan="2">작업 전</th><th colspan="2">작업 후</th></tr>
        <tr><th>이름</th><th>서명</th><th>이름</th><th>서명</th></tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    <div class="pledge-foot">${esc(tpl.pledgeText)}</div>
  </div>`;
}

// tpl: 프로젝트별 서약서 양식(회사명·교육내용·서약 문구), title: pledgeTitleFor()로 정한 제목
export function buildPledgeHtml(
  session: PledgeSessionData,
  signatures: PledgeSignatureData[],
  tpl: PledgeTemplate,
  title: string,
): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
  <style>${CSS}</style></head>
  <body>${page1(session, title, tpl)}${page2(session, signatures, tpl)}</body></html>`;
}
