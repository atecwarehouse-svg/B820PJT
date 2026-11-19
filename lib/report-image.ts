import type { Sheet, SheetBlock, Tone } from "@/lib/report-sheet";

// 보고서(Sheet) → 보고용 이미지(PNG). 팀즈 카드를 다시 캡쳐하지 않아도 되게, 카드와 같은 모양(Sheet)을
// 표 모양으로 캔버스에 직접 그린다(브라우저 전용 — 배차표 캡쳐와 같은 방식).

const W = 560; // 논리 너비(px) — 실제 픽셀은 2배
const PAD = 24;
const COLS = 4; // 노선 격자 열 수
const BRAND = "#c70a51";
const TONE_COLOR: Record<Tone, string> = { ok: "#15803d", bad: "#dc2626", none: "#9ca3af", info: "#111827" };

// 글자 단위 줄바꿈(한글은 어절 단위로 끊지 않아도 읽힌다)
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const ch of para) {
      if (cur && ctx.measureText(cur + ch).width > maxW) {
        out.push(cur);
        cur = ch;
      } else cur += ch;
    }
    out.push(cur);
  }
  return out;
}

// 캔버스에 그리고 다 그린 높이를 돌려준다 — 한 번은 높이를 재려고, 한 번은 실제로 그리려고 두 번 부른다.
function paint(ctx: CanvasRenderingContext2D, s: Sheet, font: string): number {
  const inner = W - PAD * 2;
  const f = (size: number, bold = false) => `${bold ? "bold " : ""}${size}px ${font}`;
  const text = (str: string, x: number, y: number, color: string, fnt: string, maxW?: number) => {
    ctx.fillStyle = color;
    ctx.font = fnt;
    ctx.fillText(str, x, y, maxW);
  };
  const right = (str: string, xRight: number, y: number, color: string, fnt: string) => {
    ctx.font = fnt;
    text(str, xRight - ctx.measureText(str).width, y, color, fnt);
  };
  ctx.textBaseline = "middle";

  // 머리띠
  const headH = s.sub ? 98 : 78;
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, W, headH);
  text(s.tag, PAD, 26, "rgba(255,255,255,.85)", f(13), inner);
  text(s.title, PAD, 52, "#ffffff", f(20, true), inner);
  if (s.sub) text(s.sub, PAD, 76, "rgba(255,255,255,.9)", f(13), inner);
  let y = headH + 16;

  // 수치 상자 줄들
  const GAP = 8;
  for (const row of s.kpis) {
    const tw = (inner - GAP * (row.length - 1)) / row.length;
    row.forEach((k, i) => {
      const x = PAD + i * (tw + GAP);
      ctx.fillStyle = "#f9fafb";
      ctx.fillRect(x, y, tw, 56);
      ctx.strokeStyle = "#e5e7eb";
      ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, 55);
      text(k.label, x + 12, y + 17, "#6b7280", f(11), tw - 24);
      text(k.value, x + 12, y + 38, k.accent ? BRAND : "#111827", f(17, true), tw - 24);
    });
    y += 56 + GAP;
  }
  y += 12;

  // 라벨·값 줄(값은 길면 줄바꿈)
  const LABEL_W = 156;
  const kv = (label: string, value: string, color: string) => {
    ctx.font = f(13);
    const lines = wrap(ctx, value, inner - LABEL_W - 4);
    text(label, PAD + 4, y + 10, "#6b7280", f(13), LABEL_W - 16);
    lines.forEach((ln, i) => text(ln, PAD + LABEL_W, y + 10 + i * 20, color, f(13)));
    y += lines.length * 20 + 2;
  };
  const para = (str: string, color: string, bold = false, size = 13) => {
    ctx.font = f(size, bold);
    const lh = size + 7;
    for (const ln of wrap(ctx, str, inner - 8)) {
      text(ln, PAD + 4, y + lh / 2, color, f(size, bold));
      y += lh;
    }
  };

  const block = (b: SheetBlock) => {
    switch (b.t) {
      case "band": {
        ctx.fillStyle = "#f3f4f6";
        ctx.fillRect(PAD, y, inner, 30);
        ctx.strokeStyle = "#d1d5db";
        ctx.strokeRect(PAD + 0.5, y + 0.5, inner - 1, 29);
        ctx.font = f(13, true);
        const nameW = Math.min(ctx.measureText(b.name).width, inner - 110);
        text(b.name, PAD + 10, y + 16, "#111827", f(13, true), inner - 110);
        if (b.note) text(b.note, PAD + 18 + nameW, y + 16, "#6b7280", f(12), inner - nameW - 110);
        if (b.total) right(b.total, PAD + inner - 10, y + 16, BRAND, f(13, true));
        y += 30;
        break;
      }
      case "grid": {
        const cw = inner / COLS;
        const rows = Math.ceil(b.cells.length / COLS);
        for (let i = 0; i < rows * COLS; i++) {
          const x = PAD + (i % COLS) * cw;
          const cy = y + Math.floor(i / COLS) * 28;
          ctx.strokeStyle = "#e5e7eb";
          // 이웃 칸과 테두리를 겹쳐 그려 선이 두 겹으로 보이지 않게(맨 끝 열·줄만 1px 줄임)
          ctx.strokeRect(x + 0.5, cy + 0.5, cw - (i % COLS === COLS - 1 ? 1 : 0), i >= (rows - 1) * COLS ? 27 : 28);
          const c = b.cells[i];
          if (!c) continue; // 빈 칸도 테두리는 그려 격자를 유지
          ctx.font = f(13, true);
          const cntW = ctx.measureText(c.count).width;
          text(c.label, x + 10, cy + 15, "#374151", f(13), cw - 26 - cntW);
          right(c.count, x + cw - 10, cy + 15, "#111827", f(13, true));
        }
        y += rows * 28 + 10;
        break;
      }
      case "facts":
        y += 2;
        for (const row of b.rows) kv(row.label, row.value, TONE_COLOR[row.tone ?? "info"]);
        y += 6;
        break;
      case "text":
        para(b.text, b.subtle ? "#6b7280" : "#111827", b.bold, b.big ? 15 : 13);
        break;
    }
  };

  s.sections.forEach((sec, i) => {
    if (i > 0) {
      y += 6;
      ctx.fillStyle = "#e5e7eb";
      ctx.fillRect(PAD, y, inner, 1);
      y += 14;
    }
    text(sec.title, PAD, y + 9, "#374151", f(13, true));
    y += 26;
    sec.blocks.forEach((b, j) => {
      if (b.t === "band" && j > 0) y += 8; // 운수사 묶음 사이 띄우기
      block(b);
    });
  });
  return y + PAD - 8;
}

export async function renderSheetImage(s: Sheet): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // 화면과 같은 글꼴 — 웹폰트가 덜 불러와졌으면 기다린다(안 기다리면 기본 글꼴로 그려진다)
  const font = getComputedStyle(document.body).fontFamily || "'Malgun Gothic', sans-serif";
  await document.fonts?.ready;
  const H = Math.ceil(paint(ctx, s, font)); // 1회차: 높이만 잰다
  const scale = 2; // 흐리지 않게
  canvas.width = W * scale;
  canvas.height = H * scale;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  paint(ctx, s, font);
  return new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
}

// 이미지 저장 — 폰은 공유시트(갤러리 저장·메신저 전달), PC는 파일로 바로 내려받는다.
// (PC 크롬도 공유를 지원하지만 보고서에 붙일 파일이 필요한 자리라 내려받기가 맞다)
export async function saveSheetImage(s: Sheet, filename: string): Promise<boolean> {
  const blob = await renderSheetImage(s);
  if (!blob) return false;
  const file = new File([blob], filename, { type: "image/png" });
  if (
    window.matchMedia("(pointer: coarse)").matches &&
    typeof navigator.share === "function" &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (e) {
      // 공유시트를 닫은 경우 — 아무것도 안 함. 그 밖(이미지 만드는 사이 터치 권한 만료 NotAllowedError 등)은 내려받기로
      if ((e as Error)?.name === "AbortError") return true;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

// 파일 이름 — "공항 B830_설치완료보고_2026-11-16.png" (머리말의 " 프로젝트"는 뺀다)
export function sheetFileName(projectLabel: string, kind: string, date: string): string {
  return `${projectLabel.replace(/\s*프로젝트$/, "")}_${kind}_${date}.png`.replace(/[\\/:*?"<>|]/g, "_");
}
