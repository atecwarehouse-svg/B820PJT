// 안전관리 서약서 PDF용 HTML 생성기.
// 워드 양식(인천버스 단말기 설치 안전관리 서약서.docx, 2페이지)과 동일한 구성:
//  - 1페이지: 제목 + 정보표 + [교육내용] 1~8
//  - 2페이지: 일자/설치시간 + 작업 전·후 서명표(입력 순서) + 하단 서약 문구
// print-html.ts 와 동일하게 Pretendard 폰트를 base64 로 임베드해 서버리스에서도 한글 렌더 보장.

import { PRETENDARD_WOFF2_BASE64 } from "./pretendard-font";

export interface PledgeSessionData {
  manager_name: string;
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

// 회사명(설치사) 고정값 — 워드 양식과 동일.
const INSTALLER_COMPANY = "에이텍모빌리티";

// 교육내용 (워드 양식 [교육내용] 1~8 원문 그대로)
const EDU_ITEMS = [
  "작업 시작 전에 현장에 잠재한 위험 요소를 사전 평가하고, 필요한 안전 조치를 취해야 합니다.",
  "사용되는 기계 및 장비가 정상 작동하는지, 고장이나 결함이 없는지 사전 점검이 필수적입니다.",
  "모든 근로자는 작업에 적합한 개인 보호장비(헬멧, 안전화, 안전벨트 등)를 반드시 착용해야 하며, 장비가 제대로 장착되었는지 확인해야 합니다.",
  "정해진 작업 절차와 순서를 반드시 따라야 하며, 위험 요소를 줄이기 위한 예방 조치를 준수해야 합니다.",
  "고소 작업 시 안전벨트 착용, 작업대와의 적절한 고정, 비상 대피 경로 확보 등 필수 조치를 반드시 시행해야 합니다.",
  "기계 작동 중에 근로자가 접근하거나 수리 작업을 하지 않도록 주의해야 하며, 필요한 경우 기계를 완전히 정지시키고 작업을 진행해야 합니다.",
  "작업이 끝난 후에도 현장 점검을 실시하여 위험 요소가 남아 있지 않은지 확인하고, 필요한 경우 작업 일지에 기록을 남겨야 합니다.",
  "작업 중 통행로가 막히지 않도록 바닥을 정리하고, 사고를 유발할 수 있는 장애물이나 미끄러운 바닥을 주기적으로 점검하여 위험을 최소화해야 합니다.",
];

const PLEDGE_TEXT =
  "상기 주의사항을 충분히 이해하고 인식하였으며, 이를 성실히 준수할 것을 서약합니다. " +
  "이에 따라 모든 안전 수칙을 준수하고, 중대재해 예방을 위한 의무를 다할 것을 서명으로 확인합니다.";

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

function page1(s: PledgeSessionData): string {
  const info = `
    <table class="info"><tbody>
      <tr><th>작 업 내 용</th><td colspan="3">${esc(s.work_content)}</td></tr>
      <tr><th>수      량</th><td>${esc(s.quantity)}</td><th>일      자</th><td>${esc(s.install_date)}</td></tr>
      <tr><th>운  수  사</th><td>${esc(s.operator)}</td><th>장      소</th><td>${esc(s.location)}</td></tr>
      <tr><th>안전관리 담당자</th><td colspan="3">${esc(s.manager_name)}</td></tr>
      <tr><th>회 사 명</th><td>${esc(INSTALLER_COMPANY)}</td><th>이 름 / 서 명</th><td>${esc(s.manager_name)}</td></tr>
    </tbody></table>`;

  const edu = `
    <div class="edu-head">[교육내용]</div>
    <ol class="edu">
      ${EDU_ITEMS.map((t) => `<li>${esc(t)}</li>`).join("")}
    </ol>`;

  return `<div class="page">
    <h1 class="doc-title">인천버스 단말기 설치 안전관리 서약서</h1>
    ${info}
    ${edu}
  </div>`;
}

function page2(s: PledgeSessionData, rows: PledgeSignatureData[]): string {
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
    <div class="pledge-foot">${esc(PLEDGE_TEXT)}</div>
  </div>`;
}

export function buildPledgeHtml(
  session: PledgeSessionData,
  signatures: PledgeSignatureData[],
): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
  <style>${CSS}</style></head>
  <body>${page1(session)}${page2(session, signatures)}</body></html>`;
}
