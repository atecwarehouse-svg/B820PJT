import type { VocOperatorSummary } from "@/lib/voc";
import { vocSummaryLines } from "@/lib/voc";

// 금일 설치 완료 리포트(카드) 생성 — 화면 미리보기와 메일 발송이 공유하는 순수 로직.
// 완료 = 저장(saved_at) + 설치 전·후 사진 전부 충족, 날짜는 업무일(20:00~익일 12:00) 기준.

export interface ReportInput {
  date: string; // 업무일 YYYY-MM-DD
  completedList: { operator: string; route: string; workDate: string }[];
  scheduleDays: { date: string; planned: number }[];
  plannedOverride?: number | null; // 금일 계획 수량 직접 입력값(있으면 우선)
  // 누적(계획/완료)은 기준일까지 scheduleDays·completedList에서 계산하므로 아래 값은 쓰지 않음(하위호환용).
  cumDone?: number;
  cumPlanned?: number;
}

export interface ReportGroup {
  operator: string;
  route: string;
  count: number;
}

export interface DailyReport {
  date: string;
  label: string; // MM/DD
  dow: string; // 요일
  dailyDone: number;
  dailyPlanned: number;
  dailyPct: number;
  groups: ReportGroup[];
  cumDone: number; // 누적 완료(기준일까지)
  cumPlanned: number; // 누적 계획(기준일까지 설치예정)
  cumPct: number; // 누적 달성률 = 완료/계획
  remaining: number; // 잔여 = 전체 설치대상 − 누적 완료
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

// 운행시작 점검(첫차 운행 전) — 금일완료 리포트에 함께 담는다.
export interface ServiceCheck {
  driverEdu?: boolean; // 승무사원 교육 완료
  fareSetting?: boolean; // 단말기 요금세팅 확인
  baseFare?: string; // 기본요금
  bisStatus?: string; // BIS(인천) — "ok" | "issue"
  bisSymptom?: string; // BIS 이상 증상
  kakaoStatus?: string; // 카카오(초정밀) — "ok" | "issue"
  kakaoSymptom?: string; // 카카오 이상 증상
}

// 점검 입력이 하나라도 있는지 (없으면 리포트에서 섹션 생략)
export function hasServiceCheck(c?: ServiceCheck): boolean {
  if (!c) return false;
  return Boolean(
    c.driverEdu ||
      c.fareSetting ||
      (c.baseFare ?? "").trim() ||
      c.bisStatus ||
      c.kakaoStatus,
  );
}

function fareFmt(raw?: string): string {
  const s = (raw ?? "").trim();
  return /^\d+$/.test(s) ? `${Number(s).toLocaleString()}원` : s;
}

// 점검 항목 → 표기용 {제목, 값} 목록 (메일 텍스트·HTML·팀즈 카드 공유)
export function serviceCheckRows(c?: ServiceCheck): { title: string; value: string }[] {
  if (!hasServiceCheck(c)) return [];
  const mark = (b?: boolean, done = "완료") => (b ? `✅ ${done}` : "⬜ 미확인");
  const f = fareFmt(c!.baseFare);
  const fareVal = c!.fareSetting ? (f ? `✅ 확인 (${f})` : "✅ 확인") : "⬜ 미확인";
  const stat = (s?: string, sym?: string) =>
    s === "ok"
      ? "✅ 이상없음"
      : s === "issue"
        ? sym?.trim()
          ? `⚠️ 이상 - ${sym.trim()}`
          : "⚠️ 이상"
        : "⬜ 미확인";
  return [
    { title: "승무사원 교육", value: mark(c!.driverEdu, "교육완료") },
    { title: "요금세팅", value: fareVal },
    { title: "BIS(인천)", value: stat(c!.bisStatus, c!.bisSymptom) },
    { title: "카카오(초정밀)", value: stat(c!.kakaoStatus, c!.kakaoSymptom) },
  ];
}

export function buildReport(input: ReportInput): DailyReport {
  const { date } = input;
  const [y, m, d] = date.split("-").map(Number);
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
  const label = `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;

  const dayItems = input.completedList.filter((c) => c.workDate === date);
  const gmap = new Map<string, ReportGroup>();
  for (const it of dayItems) {
    const key = `${it.operator}|||${it.route}`;
    const g = gmap.get(key) ?? { operator: it.operator, route: it.route, count: 0 };
    g.count++;
    gmap.set(key, g);
  }
  const groups = [...gmap.values()].sort((a, b) => b.count - a.count);

  const dailyDone = dayItems.length;
  // 직접 입력한 계획 수량이 있으면 우선, 없으면 예정일 기준 자동 계산
  const dailyPlanned =
    typeof input.plannedOverride === "number" && isFinite(input.plannedOverride)
      ? input.plannedOverride
      : input.scheduleDays.find((s) => s.date === date)?.planned ?? 0;
  const dailyPct = dailyPlanned ? (dailyDone / dailyPlanned) * 100 : 0;

  // 누적(기준일까지): 설치예정일 누적 계획 vs 그 날짜까지 완료
  const cumPlanned = input.scheduleDays
    .filter((s) => s.date <= date)
    .reduce((sum, s) => sum + s.planned, 0);
  const cumDone = input.completedList.filter((c) => c.workDate <= date).length;
  const cumPct = cumPlanned ? (cumDone / cumPlanned) * 100 : 0;

  // 잔여 = 전체 설치대상(전체 예정 대수) − 누적 완료
  const totalTarget = input.scheduleDays.reduce((sum, s) => sum + s.planned, 0);
  const remaining = Math.max(0, totalTarget - cumDone);

  return {
    date,
    label,
    dow,
    dailyDone,
    dailyPlanned,
    dailyPct,
    groups,
    cumDone,
    cumPlanned,
    cumPct,
    remaining,
  };
}

// 특이사항 정규화 — 각 줄 앞에 '- ' 붙이고, 비면 '- 없음'
function noteLines(notes: string): string[] {
  const t = notes.trim();
  if (!t) return ["- 없음"];
  return t.split(/\r?\n/).map((l) => {
    const s = l.trim();
    if (!s) return "";
    return s.startsWith("-") ? s : `- ${s}`;
  }).filter(Boolean);
}

const HR = "━━━━━━━━━━━━━━━";

// 메일/복사용 평문 카드
export function formatReportText(
  r: DailyReport,
  notes: string,
  check?: ServiceCheck,
  vocs?: VocOperatorSummary[], // 2차 발송에서만 전달 — 운수사 VOC 섹션
): string {
  const lines: string[] = [];
  lines.push("[인천버스 B820 단말기 설치 프로젝트]");
  lines.push(`설치 완료 (${r.label}, ${r.dow})`);
  lines.push(`금일 설치 수량 (실적/계획): ${r.dailyDone}대 / ${r.dailyPlanned}대 ${r.dailyPct.toFixed(1)}%`);
  lines.push("");
  if (r.groups.length === 0) {
    lines.push("- (완료 없음)");
  } else {
    for (const g of r.groups) {
      lines.push(`- ${g.operator}${g.route ? ` ${g.route}노선` : ""} : ${g.count}대`);
    }
  }
  lines.push(HR);
  lines.push(`누적 계획 : ${r.cumPlanned}대`);
  lines.push(`누적 설치 완료 : ${r.cumDone}대 ${r.cumPct.toFixed(1)}%`);
  lines.push(`잔여 : ${r.remaining}대`);
  lines.push(HR);
  const checkRows = serviceCheckRows(check);
  if (checkRows.length) {
    lines.push("○ 운행시작 점검");
    for (const row of checkRows) lines.push(`- ${row.title} : ${row.value}`);
    lines.push(HR);
  }
  if (vocs?.length) {
    lines.push("○ 운수사 VOC");
    for (const v of vocs) {
      const [head, ...rest] = vocSummaryLines(v);
      lines.push(`- ${head}`);
      for (const r2 of rest) lines.push(`  · ${r2}`);
    }
    lines.push(HR);
  }
  lines.push("○ 특이사항");
  lines.push(...noteLines(notes));
  lines.push("");
  lines.push("※ 에이텍모빌리티 내부인원 보고용 자동발송메일입니다.");
  return lines.join("\n");
}

// 메일용 HTML 카드 (이메일에서 카드처럼 보이게)
export function formatReportHtml(
  r: DailyReport,
  notes: string,
  check?: ServiceCheck,
  vocs?: VocOperatorSummary[],
): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows =
    r.groups.length === 0
      ? `<li>(완료 없음)</li>`
      : r.groups
          .map((g) => `<li>${esc(g.operator)}${g.route ? " " + esc(g.route) + "노선" : ""} : <b>${g.count}대</b></li>`)
          .join("");
  const notesHtml = noteLines(notes).map((l) => `<li>${esc(l.replace(/^-\s*/, ""))}</li>`).join("");

  // 운행시작 점검 섹션 (있을 때만) — 이상 항목은 붉게
  const checkRows = serviceCheckRows(check);
  const checkHtml = checkRows.length
    ? `<div style="border-top:1px dashed #d1d5db;margin:12px 0"></div>
    <div style="font-weight:600;margin-bottom:4px">○ 운행시작 점검</div>
    <ul style="margin:0 0 4px;padding-left:18px;line-height:1.7;color:#374151">${checkRows
      .map(
        (row) =>
          `<li>${esc(row.title)} : <span style="${row.value.startsWith("⚠️") ? "color:#dc2626;font-weight:600" : ""}">${esc(row.value)}</span></li>`,
      )
      .join("")}</ul>`
    : "";

  // 운수사 VOC 섹션 (2차 발송에서만 전달됨)
  const vocHtml = vocs?.length
    ? `<div style="border-top:1px dashed #d1d5db;margin:12px 0"></div>
    <div style="font-weight:600;margin-bottom:4px">○ 운수사 VOC</div>
    <ul style="margin:0 0 4px;padding-left:18px;line-height:1.7;color:#374151">${vocs
      .map((v) => {
        const [head, ...rest] = vocSummaryLines(v);
        const sub = rest.length
          ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">${rest
              .map((l) => esc(l))
              .join("<br/>")}</div>`
          : "";
        return `<li><b>${esc(head)}</b>${sub}</li>`;
      })
      .join("")}</ul>`
    : "";

  return `<div style="max-width:480px;margin:0 auto;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;font-family:'Apple SD Gothic Neo',Malgun Gothic,sans-serif">
  <div style="background:#1d4ed8;color:#fff;padding:14px 18px">
    <div style="font-size:13px;opacity:.85">[인천버스 B820 단말기 설치 프로젝트]</div>
    <div style="font-size:18px;font-weight:700;margin-top:2px">설치 완료 (${r.label}, ${r.dow})</div>
  </div>
  <div style="padding:16px 18px">
    <div style="font-size:15px;margin-bottom:10px">금일 설치 수량 (실적/계획): <b>${r.dailyDone}대</b> / ${r.dailyPlanned}대 <span style="color:#1d4ed8;font-weight:700">${r.dailyPct.toFixed(1)}%</span></div>
    <ul style="margin:0 0 12px;padding-left:18px;line-height:1.7;color:#374151">${rows}</ul>
    <div style="border-top:1px dashed #d1d5db;margin:12px 0"></div>
    <div style="font-size:14px;color:#111827">누적 계획 : <b>${r.cumPlanned}대</b></div>
    <div style="font-size:14px;color:#111827;margin-top:3px">누적 설치 완료 : <b>${r.cumDone}대</b> <span style="color:#16a34a;font-weight:700">${r.cumPct.toFixed(1)}%</span></div>
    <div style="font-size:14px;color:#111827;margin-top:3px">잔여 : <b>${r.remaining}대</b></div>
    ${checkHtml}
    ${vocHtml}
    <div style="border-top:1px dashed #d1d5db;margin:12px 0"></div>
    <div style="font-weight:600;margin-bottom:4px">○ 특이사항</div>
    <ul style="margin:0 0 4px;padding-left:18px;line-height:1.7;color:#374151">${notesHtml}</ul>
    <div style="margin-top:14px;font-size:11px;color:#9ca3af">※ 에이텍모빌리티 내부인원 보고용 자동발송메일입니다.</div>
  </div>
</div>`;
}
