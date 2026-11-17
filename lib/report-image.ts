import type { DailyReport, ServiceCheck } from "@/lib/report";
import { groupByOperator, noteLines, serviceCheckRows } from "@/lib/report";
import type { VocOperatorSummary } from "@/lib/voc";
import { VOC_RATINGS, starBar } from "@/lib/voc";

// 금일 완료 리포트 → 보고용 이미지(PNG). 팀즈 카드를 다시 캡쳐하지 않아도 되게,
// 같은 내용을 표 모양으로 캔버스에 직접 그린다(브라우저 전용 — 배차표 캡쳐와 같은 방식).

const W = 560; // 논리 너비(px) — 실제 픽셀은 2배
const PAD = 24;
const COLS = 4; // 노선 격자 열 수
const BRAND = "#c70a51";

export interface ReportImageInput {
  projectLabel: string; // 머리말 "[…]"
  report: DailyReport;
  notes: string;
  check?: ServiceCheck;
  vocs?: VocOperatorSummary[];
}

// 글자 단위 줄바꿈(한글은 어절 단위로 끊지 않아도 읽힌다)
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (cur && ctx.measureText(cur + ch).width > maxW) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// 점검값 앞의 그림문자는 기기마다 모양이 달라 떼고, 글자색으로 상태를 나타낸다.
function checkValue(v: string): { text: string; color: string } {
  const m = /^(✅|⬜|🕒|⚠️)\s*/u.exec(v);
  const text = m ? v.slice(m[0].length) : v;
  const color =
    m?.[1] === "✅" ? "#15803d" : m?.[1] === "⚠️" ? "#dc2626" : m?.[1] === "⬜" ? "#9ca3af" : "#111827";
  return { text, color };
}

// 캔버스에 그리고 다 그린 높이를 돌려준다 — 한 번은 높이를 재려고, 한 번은 실제로 그리려고 두 번 부른다.
function paint(ctx: CanvasRenderingContext2D, d: ReportImageInput, font: string): number {
  const r = d.report;
  const inner = W - PAD * 2;
  const f = (size: number, bold = false) => `${bold ? "bold " : ""}${size}px ${font}`;
  const text = (s: string, x: number, y: number, color: string, fnt: string, maxW?: number) => {
    ctx.fillStyle = color;
    ctx.font = fnt;
    ctx.fillText(s, x, y, maxW);
  };
  const right = (s: string, xRight: number, y: number, color: string, fnt: string) => {
    ctx.font = fnt;
    text(s, xRight - ctx.measureText(s).width, y, color, fnt);
  };
  ctx.textBaseline = "middle";

  // 머리말
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, W, 78);
  text(`[${d.projectLabel}]`, PAD, 26, "rgba(255,255,255,.85)", f(13), inner);
  text(`설치 완료 보고 (${r.label}, ${r.dow})`, PAD, 52, "#ffffff", f(20, true), inner);
  let y = 78 + 16;

  // 수치 타일 3칸 × 2줄
  const GAP = 8;
  const tw = (inner - GAP * 2) / 3;
  const tiles: [string, string, string][] = [
    ["금일 실적", `${r.dailyDone.toLocaleString()}대`, "#111827"],
    ["금일 계획", `${r.dailyPlanned.toLocaleString()}대`, "#111827"],
    ["달성률", `${r.dailyPct.toFixed(1)}%`, BRAND],
    ["누적 계획", `${r.cumPlanned.toLocaleString()}대`, "#111827"],
    ["누적 완료", `${r.cumDone.toLocaleString()}대 (${r.cumPct.toFixed(1)}%)`, "#111827"],
    ["잔여", `${r.remaining.toLocaleString()}대`, "#111827"],
  ];
  tiles.forEach(([label, value, color], i) => {
    const x = PAD + (i % 3) * (tw + GAP);
    const ty = y + Math.floor(i / 3) * (56 + GAP);
    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(x, ty, tw, 56);
    ctx.strokeStyle = "#e5e7eb";
    ctx.strokeRect(x + 0.5, ty + 0.5, tw - 1, 55);
    text(label, x + 12, ty + 17, "#6b7280", f(11));
    text(value, x + 12, ty + 38, color, f(17, true), tw - 24);
  });
  y += 56 * 2 + GAP + 20;

  const section = (title: string) => {
    text(title, PAD, y + 9, "#374151", f(13, true));
    y += 26;
  };

  // 금일 설치 내역 — 운수사 띠 + 노선 격자
  section("금일 설치 내역");
  const ops = groupByOperator(r.groups);
  if (ops.length === 0) {
    text("(완료 없음)", PAD + 4, y + 10, "#9ca3af", f(13));
    y += 24;
  }
  const cw = inner / COLS;
  for (const o of ops) {
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(PAD, y, inner, 30);
    ctx.strokeStyle = "#d1d5db";
    ctx.strokeRect(PAD + 0.5, y + 0.5, inner - 1, 29);
    text(o.operator, PAD + 10, y + 16, "#111827", f(13, true), inner - 90);
    right(`${o.total.toLocaleString()}대`, PAD + inner - 10, y + 16, BRAND, f(13, true));
    y += 30;
    const rows = Math.ceil(o.routes.length / COLS);
    for (let i = 0; i < rows * COLS; i++) {
      const x = PAD + (i % COLS) * cw;
      const cy = y + Math.floor(i / COLS) * 28;
      ctx.strokeStyle = "#e5e7eb";
      // 이웃 칸과 테두리를 겹쳐 그려 선이 두 겹으로 보이지 않게(맨 끝 열·줄만 1px 줄임)
      ctx.strokeRect(x + 0.5, cy + 0.5, cw - (i % COLS === COLS - 1 ? 1 : 0), i >= (rows - 1) * COLS ? 27 : 28);
      const c = o.routes[i];
      if (!c) continue; // 빈 칸도 테두리는 그려 격자를 유지
      const cnt = `${c.count.toLocaleString()}대`;
      ctx.font = f(13, true);
      const cntW = ctx.measureText(cnt).width;
      text(c.route, x + 10, cy + 15, "#374151", f(13), cw - 26 - cntW);
      right(cnt, x + cw - 10, cy + 15, "#111827", f(13, true));
    }
    y += rows * 28 + 10;
  }
  y += 8;

  // 라벨·값 줄(값은 길면 줄바꿈) — 점검·VOC 항목이 공유
  const LABEL_W = 156;
  const kv = (label: string, value: string, color: string) => {
    ctx.font = f(13);
    const lines = wrap(ctx, value, inner - LABEL_W - 4);
    text(label, PAD + 4, y + 10, "#6b7280", f(13), LABEL_W - 16);
    lines.forEach((ln, i) => text(ln, PAD + LABEL_W, y + 10 + i * 20, color, f(13)));
    y += lines.length * 20 + 2;
  };
  const para = (s: string, color: string, bold = false) => {
    ctx.font = f(13, bold);
    for (const ln of wrap(ctx, s, inner - 8)) {
      text(ln, PAD + 4, y + 10, color, f(13, bold));
      y += 20;
    }
  };
  const rule = () => {
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(PAD, y, inner, 1);
    y += 14;
  };

  const checkRows = serviceCheckRows(d.check);
  if (checkRows.length) {
    rule();
    section("운행시작 점검");
    for (const row of checkRows) {
      const v = checkValue(row.value);
      kv(row.title, v.text, v.color);
    }
    y += 10;
  }

  if (d.vocs?.length) {
    rule();
    section("운수사 VOC");
    for (const v of d.vocs) {
      para(
        `${v.operator} : ${v.avg !== null ? starBar(v.avg) : "평가 없음"} (${v.vehicles}대 중 ${v.rated}대 응답)`,
        "#111827",
        true,
      );
      for (const k of VOC_RATINGS) {
        if (v.averages[k.key] !== undefined) kv(k.label, starBar(v.averages[k.key]!), "#111827");
      }
      for (const c of v.comments) para(`${c.plate}${c.route ? ` (${c.route})` : ""} : ${c.comment}`, "#6b7280");
      if (v.notes) para(`특이사항 : ${v.notes}`, "#6b7280");
      y += 6;
    }
    y += 4;
  }

  rule();
  section("특이사항");
  for (const ln of noteLines(d.notes)) {
    // 자동 목록 머리줄([설치제외 N대] 등)은 불릿을 떼고 굵게 — 아래 차량 목록의 제목 역할
    const head = /^-\s*(\[.+\])$/.exec(ln);
    if (head) para(head[1], "#111827", true);
    else para(ln, "#111827");
  }
  return y + PAD - 8;
}

export async function renderReportImage(d: ReportImageInput): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // 화면과 같은 글꼴 — 웹폰트가 덜 불러와졌으면 기다린다(안 기다리면 기본 글꼴로 그려진다)
  const font = getComputedStyle(document.body).fontFamily || "'Malgun Gothic', sans-serif";
  await document.fonts?.ready;
  const H = Math.ceil(paint(ctx, d, font)); // 1회차: 높이만 잰다
  const scale = 2; // 흐리지 않게
  canvas.width = W * scale;
  canvas.height = H * scale;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  paint(ctx, d, font);
  return new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
}

// 이미지 저장 — 폰은 공유시트(갤러리 저장·메신저 전달), PC는 파일로 바로 내려받는다.
// (PC 크롬도 공유를 지원하지만 보고서에 붙일 파일이 필요한 자리라 내려받기가 맞다)
export async function saveReportImage(d: ReportImageInput, filename: string): Promise<boolean> {
  const blob = await renderReportImage(d);
  if (!blob) return false;
  const file = new File([blob], filename, { type: "image/png" });
  if (
    window.matchMedia("(pointer: coarse)").matches &&
    typeof navigator.share === "function" &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file] });
    } catch {
      // 공유시트를 닫은 경우 — 아무것도 안 함
    }
    return true;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
