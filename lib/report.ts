// 금일 설치 완료 리포트(카드) 생성 — 화면 미리보기와 메일 발송이 공유하는 순수 로직.
// 완료 = 저장(saved_at), 날짜는 업무일(20:00~익일 12:00) 기준.

export interface ReportInput {
  date: string; // 업무일 YYYY-MM-DD
  completedList: { operator: string; route: string; workDate: string }[];
  scheduleDays: { date: string; planned: number }[];
  cumDone: number; // 누적 완료
  cumPlanned: number; // 누적 계획(전체 대상)
  plannedOverride?: number | null; // 금일 계획 수량 직접 입력값(있으면 우선)
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
  cumDone: number;
  cumPlanned: number;
  cumPct: number;
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

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
  const cumPct = input.cumPlanned ? (input.cumDone / input.cumPlanned) * 100 : 0;

  return {
    date,
    label,
    dow,
    dailyDone,
    dailyPlanned,
    dailyPct,
    groups,
    cumDone: input.cumDone,
    cumPlanned: input.cumPlanned,
    cumPct,
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
export function formatReportText(r: DailyReport, notes: string): string {
  const lines: string[] = [];
  lines.push("[B820 단말기 설치 프로젝트]");
  lines.push(`설치 완료 (${r.label}, ${r.dow})`);
  lines.push(`설치 수량 (실적/계획): ${r.dailyDone}대 / ${r.dailyPlanned}대 ${r.dailyPct.toFixed(1)}%`);
  lines.push("");
  if (r.groups.length === 0) {
    lines.push("- (완료 없음)");
  } else {
    for (const g of r.groups) {
      lines.push(`- ${g.operator}${g.route ? ` ${g.route}` : ""} ${g.count}대`);
    }
  }
  lines.push(HR);
  lines.push("○ 특이사항");
  lines.push(...noteLines(notes));
  lines.push(HR);
  lines.push(`누적 설치 (실적/계획): ${r.cumDone}대 / ${r.cumPlanned}대 ${r.cumPct.toFixed(1)}%`);
  return lines.join("\n");
}

// 메일용 HTML 카드 (이메일에서 카드처럼 보이게)
export function formatReportHtml(r: DailyReport, notes: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows =
    r.groups.length === 0
      ? `<li>(완료 없음)</li>`
      : r.groups
          .map((g) => `<li>${esc(g.operator)}${g.route ? " " + esc(g.route) : ""} <b>${g.count}대</b></li>`)
          .join("");
  const notesHtml = noteLines(notes).map((l) => `<li>${esc(l.replace(/^-\s*/, ""))}</li>`).join("");
  return `<div style="max-width:480px;margin:0 auto;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;font-family:'Apple SD Gothic Neo',Malgun Gothic,sans-serif">
  <div style="background:#1d4ed8;color:#fff;padding:14px 18px">
    <div style="font-size:13px;opacity:.85">[B820 단말기 설치 프로젝트]</div>
    <div style="font-size:18px;font-weight:700;margin-top:2px">설치 완료 (${r.label}, ${r.dow})</div>
  </div>
  <div style="padding:16px 18px">
    <div style="font-size:15px;margin-bottom:10px">설치 수량 (실적/계획): <b>${r.dailyDone}대</b> / ${r.dailyPlanned}대 <span style="color:#1d4ed8;font-weight:700">${r.dailyPct.toFixed(1)}%</span></div>
    <ul style="margin:0 0 12px;padding-left:18px;line-height:1.7;color:#374151">${rows}</ul>
    <div style="border-top:1px dashed #d1d5db;margin:12px 0"></div>
    <div style="font-weight:600;margin-bottom:4px">○ 특이사항</div>
    <ul style="margin:0 0 12px;padding-left:18px;line-height:1.7;color:#374151">${notesHtml}</ul>
    <div style="border-top:1px dashed #d1d5db;margin:12px 0"></div>
    <div style="font-size:14px;color:#111827">누적 설치 (실적/계획): <b>${r.cumDone}대</b> / ${r.cumPlanned}대 <span style="color:#16a34a;font-weight:700">${r.cumPct.toFixed(1)}%</span></div>
  </div>
</div>`;
}
