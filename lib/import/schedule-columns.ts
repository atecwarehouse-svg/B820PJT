// 전개일정 시트의 날짜 칸(계획·완료 열 한 쌍)을 필요한 만큼 오른쪽으로 늘린다.
// B820 양식은 H~DY 61쌍(4행 "계획"/"완료")으로 고정 — 새 프로젝트 기간·설치 예정일이 더 길면 쌍을 덧붙인다.
//
// 마지막 쌍(DX 계획, DY 완료)을 행마다 복제하면서
//   · 수식은 열 참조를 +2k 옮긴다 (1행 누적 DV1+DX2 → DX1+DZ2, 2행·합계행 SUM(DX5:DX341) → SUM(DZ5:DZ341),
//     데이터 행 완료 COUNTIFS(…DX$3…) → DZ$3). 데이터 행 완료 수식은 열마다 공유 수식 한 덩어리로 쓴다(파일 크기).
//   · 값은 4행(계획/완료 머리글)만 복사, 나머지는 서식만 있는 빈 칸.
//   · 1~3행 쌍 병합(DX1:DY1 등), <cols> 너비, dimension, 요약 G1~G3(DX→새 마지막 계획 열)도 함께.
// 진행현황 시트 A6·F6(SUMIF 전개일정!$H$3:$..$3)은 fixProgressPlanRange로 마지막 열까지 넓힌다.

import { cellValue } from "@/lib/export/fill-progress-xlsx";

export const MAX_PLAN_DAYS = 366; // 날짜 칸 상한 (1년) — 열·수식이 너무 커지지 않게

export const colNum = (s: string) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
export function colName(n: number): string {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const ROW_RE = /<row r="(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
const CELL_RE = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

/** 수식의 상대 참조를 dCol열·dRow행 옮긴다 ($ 붙은 쪽은 고정, "문자열" 안은 건드리지 않음) */
export function shiftRefs(f: string, dCol: number, dRow: number): string {
  return f
    .split('"')
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(/(?<![A-Za-z0-9_])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g, (_m, ca: string, c: string, ra: string, r: string) =>
            `${ca}${ca ? c : colName(colNum(c) + dCol)}${ra}${ra ? r : Number(r) + dRow}`,
          ),
    )
    .join('"');
}

/** 4행 "계획" 머리글이 있는 열(H~) */
export function planColumns(sx: string, shared: string[]): string[] {
  const row4 = sx.match(/<row r="4"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/)?.[1] ?? "";
  return [...row4.matchAll(CELL_RE)]
    .filter((c) => colNum(c[1]) >= 8 && cellValue(c[3], c[4] ?? "", shared).trim() === "계획")
    .map((c) => c[1]);
}

/** 계획 열이 need개가 되도록 쌍을 덧붙인다. 이미 충분하면 그대로. */
export function expandPlanColumns(sx: string, shared: string[], need: number): { sx: string; cols: string[] } {
  const cols = planColumns(sx, shared);
  const extra = need - cols.length;
  if (!cols.length || extra <= 0) return { sx, cols };
  const P = colNum(cols[cols.length - 1]); // 마지막 계획 열 (DX)
  const C = P + 1; // 그 완료 열 (DY)
  const pl = colName(P);
  const cl = colName(C);

  // 공유 수식 원본(si → 수식·위치) — 엑셀이 재저장하면 DY6… 이 <f t="shared" si/> 자식이 된다
  const masters = new Map<string, { f: string; col: number; row: number }>();
  for (const m of sx.matchAll(/<c r="([A-Z]+)(\d+)"[^>]*><f t="shared" ref="[^"]*" si="(\d+)">([^<]*)<\/f>/g)) {
    masters.set(m[3], { f: m[4], col: colNum(m[1]), row: Number(m[2]) });
  }
  const formulaOf = (inner: string, col: number, row: number): string | null => {
    const full = inner.match(/<f(?: [^>]*)?>([^<]*)<\/f>/);
    if (full) return full[1];
    const si = inner.match(/<f t="shared"[^>]*si="(\d+)"[^>]*\/>/)?.[1];
    const m = si ? masters.get(si) : undefined;
    return m ? shiftRefs(m.f, col - m.col, row - m.row) : null;
  };
  let nextSi = Math.max(-1, ...[...sx.matchAll(/ si="(\d+)"/g)].map((m) => Number(m[1]))) + 1;

  // 새 열마다 진행 중인 공유 수식 덩어리 (같은 모양이 연속되는 동안 자식으로)
  const run = new Map<number, { si: number; f: string; row: number; last: number; token: string }>();
  const refs = new Map<string, string>(); // token → ref 범위
  const close = (col: number) => {
    const r = run.get(col);
    if (r) refs.set(r.token, `${colName(col)}${r.row}:${colName(col)}${r.last}`);
    run.delete(col);
  };

  let maxRow = 0;
  let out = sx.replace(ROW_RE, (whole, rnStr: string, attrs: string, inner?: string) => {
    const rn = Number(rnStr);
    maxRow = Math.max(maxRow, rn);
    const a = attrs.replace(/\s*spans="[^"]*"/, "");
    if (inner === undefined) return `<row r="${rn}"${a}/>`;
    const src: Record<string, { attrs: string; inner: string } | undefined> = {};
    for (const c of inner.matchAll(CELL_RE)) if (c[1] === pl || c[1] === cl) src[c[1]] = { attrs: c[3], inner: c[4] ?? "" };
    let add = "";
    for (let k = 1; k <= extra; k++) {
      for (const [from, base] of [[pl, P], [cl, C]] as const) {
        const col = base + 2 * k;
        const ref = `${colName(col)}${rn}`;
        const s = src[from];
        if (!s) {
          close(col);
          continue;
        }
        const st = s.attrs.match(/\bs="\d+"/)?.[0];
        const sAttr = st ? ` ${st}` : "";
        const f0 = formulaOf(s.inner, base, rn);
        if (f0 != null) {
          const f = shiftRefs(f0, 2 * k, 0);
          const r = run.get(col);
          if (r && r.last === rn - 1 && shiftRefs(r.f, 0, rn - r.row) === f) {
            r.last = rn;
            add += `<c r="${ref}"${sAttr}><f t="shared" si="${r.si}"/></c>`;
          } else {
            close(col);
            const token = `@@REF${col}_${rn}@@`;
            run.set(col, { si: nextSi, f, row: rn, last: rn, token });
            add += `<c r="${ref}"${sAttr}><f t="shared" ref="${token}" si="${nextSi++}">${f}</f></c>`;
          }
          continue;
        }
        close(col);
        if (rn === 4 && /<v>/.test(s.inner)) {
          const t = s.attrs.match(/\bt="[^"]*"/)?.[0];
          add += `<c r="${ref}"${sAttr}${t ? ` ${t}` : ""}>${s.inner}</c>`;
        } else add += `<c r="${ref}"${sAttr}/>`;
      }
    }
    // 요약 G1~G3: 마지막 계획 열(DX) 참조 → 새 마지막 계획 열
    const lastPl = colName(P + 2 * extra);
    const body = rn <= 3
      ? inner.replace(/(<c r="[A-G]\d+"[^>]*><f>)([^<]*)(<\/f>)/g, (_m, o: string, f: string, e: string) =>
          o + f.replace(new RegExp(`(?<![A-Za-z0-9_])(\\$?)${pl}(\\$?)(\\d+)`, "g"), `$1${lastPl}$2$3`) + e)
      : inner;
    return `<row r="${rn}"${a}>${body}${add}</row>`;
  });
  for (const col of [...run.keys()]) close(col);
  out = out.replace(/@@REF\d+_\d+@@/g, (t) => refs.get(t) ?? "");

  // 1~3행 쌍 병합
  const merges: string[] = [];
  for (const m of out.matchAll(new RegExp(`<mergeCell ref="${pl}(\\d+):${cl}\\1"/>`, "g"))) {
    for (let k = 1; k <= extra; k++) merges.push(`<mergeCell ref="${colName(P + 2 * k)}${m[1]}:${colName(C + 2 * k)}${m[1]}"/>`);
  }
  if (merges.length) {
    out = out.replace(/<mergeCells count="(\d+)">/, (_m, n: string) => `<mergeCells count="${Number(n) + merges.length}">${merges.join("")}`);
  }

  // 열 너비: DY를 덮는 <col> 설정을 새 열에 복사하고, 그 뒤 설정은 밀어낸다
  const last = C + 2 * extra;
  out = out.replace(/<cols>([\s\S]*?)<\/cols>/, (_m, body: string) => {
    const list: string[] = [];
    for (const c of body.match(/<col\b[^>]*\/>/g) ?? []) {
      const min = Number(c.match(/min="(\d+)"/)?.[1]);
      const max = Number(c.match(/max="(\d+)"/)?.[1]);
      if (min > C) {
        const nmin = min + 2 * extra;
        if (nmin > 16384) continue;
        list.push(c.replace(/min="\d+"/, `min="${nmin}"`).replace(/max="\d+"/, `max="${Math.min(16384, max + 2 * extra)}"`));
      } else if (max >= C) {
        list.push(c.replace(/max="\d+"/, `max="${C}"`));
        list.push(c.replace(/min="\d+"/, `min="${C + 1}"`).replace(/max="\d+"/, `max="${last}"`));
        if (max > C) list.push(c.replace(/min="\d+"/, `min="${last + 1}"`).replace(/max="\d+"/, `max="${Math.min(16384, max + 2 * extra)}"`));
      } else list.push(c);
    }
    return `<cols>${list.join("")}</cols>`;
  });
  out = out.replace(/<dimension ref="A1:([A-Z]+)(\d+)"\/>/, (_m, c: string, r: string) =>
    `<dimension ref="A1:${colName(Math.max(colNum(c), last))}${Math.max(Number(r), maxRow)}"/>`);

  const newCols = [...cols];
  for (let k = 1; k <= extra; k++) newCols.push(colName(P + 2 * k));
  return { sx: out, cols: newCols };
}

/** 진행현황 A6·F6의 SUMIF(전개일정!$H$3:$??$3 …, 전개일정!$H$2:$??$2) 끝 열을 lastCol로 */
export function fixProgressPlanRange(px: string, lastCol: string): string {
  return px.replace(/(전개일정'?!\$H\$\d+:\$)[A-Z]{1,3}(\$\d+)/g, `$1${lastCol}$2`);
}
