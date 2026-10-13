// 워크시트 XML(xl/worksheets/sheetN.xml) 수술 도구 — 엑셀의 "행/열 삽입·삭제"와 "채우기" 의미를 그대로 흉내 낸다.
//   · insertRows/insertCols: 삽입 지점 이후 참조는 전부(절대·상대 모두) 밀리고, 삽입 지점을 가로지르는 범위(SUM(D9:D10)·병합·조건부서식)는 늘어난다.
//   · 복제(clone): 템플릿 행/열의 수식을 상대 참조만 오프셋만큼 옮겨 넣는다(엑셀 '아래로/오른쪽으로 채우기').
//   · deleteRows/deleteCols: 지운 범위 뒤 참조는 당겨지고, 범위 끝이 지워지면 줄어든다(마스터 양식 만들 때만 사용).
// 다른 시트가 이 시트를 참조하는 수식은 건드리지 않는다(이 앱의 양식은 삽입 지점 위쪽(6행)만 교차 참조한다).
// ExcelJS로 다시 쓰지 않는 이유: 조건부서식 데이터막대(x14)·병합·열 너비·인쇄 설정을 바이트 그대로 보존하기 위해.

export interface Cell {
  col: number; // 1=A
  attrs: string; // r= 제외한 속성 문자열 (예: ' s="12" t="s"')
  inner: string; // <c>…</c> 안쪽 ("" = self-closing)
}
export interface Row {
  r: number;
  attrs: string; // r=·spans= 제외
  cells: Cell[];
}
export interface Sheet {
  name: string; // 시트 이름(수식의 자기 참조 판별용)
  head: string; // <sheetData> 앞
  rows: Row[];
  tail: string; // </sheetData> 뒤
}

const ROW_RE = /<row r="(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
const CELL_RE = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

export function colNum(name: string): number {
  let n = 0;
  for (const ch of name) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
export function colName(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export const escXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function parseSheet(xml: string, name: string): Sheet {
  const open = xml.indexOf("<sheetData");
  const openEnd = xml.indexOf(">", open) + 1;
  const selfClosing = xml.slice(open, openEnd).endsWith("/>");
  const close = selfClosing ? openEnd : xml.indexOf("</sheetData>");
  const head = xml.slice(0, open) + "<sheetData>";
  const body = selfClosing ? "" : xml.slice(openEnd, close);
  const tail = "</sheetData>" + xml.slice(selfClosing ? openEnd : close + "</sheetData>".length);
  const rows: Row[] = [];
  for (const m of body.matchAll(ROW_RE)) {
    const cells: Cell[] = [];
    for (const c of (m[3] ?? "").matchAll(CELL_RE)) cells.push({ col: colNum(c[1]), attrs: c[3] ?? "", inner: c[4] ?? "" });
    rows.push({ r: Number(m[1]), attrs: (m[2] ?? "").replace(/\s*spans="[^"]*"/, ""), cells });
  }
  return { name, head, rows, tail };
}

export function serializeSheet(s: Sheet): string {
  s.rows.sort((a, b) => a.r - b.r);
  let minC = Infinity, maxC = 0, minR = Infinity, maxR = 0;
  const body = s.rows
    .map((row) => {
      row.cells.sort((a, b) => a.col - b.col);
      if (row.cells.length) {
        minR = Math.min(minR, row.r);
        maxR = Math.max(maxR, row.r);
        minC = Math.min(minC, row.cells[0].col);
        maxC = Math.max(maxC, row.cells[row.cells.length - 1].col);
      }
      const cells = row.cells
        .map((c) => (c.inner ? `<c r="${colName(c.col)}${row.r}"${c.attrs}>${c.inner}</c>` : `<c r="${colName(c.col)}${row.r}"${c.attrs}/>`))
        .join("");
      return cells ? `<row r="${row.r}"${row.attrs}>${cells}</row>` : `<row r="${row.r}"${row.attrs}/>`;
    })
    .join("");
  const dim = maxR ? `${colName(minC)}${minR}:${colName(maxC)}${maxR}` : "A1";
  const head = s.head.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="${dim}"/>`);
  return head + body + s.tail;
}

// ── 참조 변환 ────────────────────────────────────────────────────────────────
type Axis = "row" | "col";
type Op =
  | { kind: "insert"; at: number; count: number } // n>=at → n+count
  | { kind: "delete"; from: number; to: number } // from..to 삭제, 뒤는 당김
  | { kind: "offset"; by: number }; // 채우기: 상대 참조만 by만큼

interface RefPart {
  absCol: boolean;
  col: number;
  absRow: boolean;
  row: number;
}

function applyOp(n: number, abs: boolean, op: Op): number | null {
  if (op.kind === "insert") return n >= op.at ? n + op.count : n;
  if (op.kind === "delete") return n < op.from ? n : n > op.to ? n - (op.to - op.from + 1) : null;
  return abs ? n : n + op.by;
}

function mapRef(p: RefPart, axis: Axis, op: Op): RefPart | null {
  const v = axis === "row" ? applyOp(p.row, p.absRow, op) : applyOp(p.col, p.absCol, op);
  if (v === null) return null;
  return axis === "row" ? { ...p, row: v } : { ...p, col: v };
}

function fmtRef(p: RefPart): string {
  return `${p.absCol ? "$" : ""}${colName(p.col)}${p.absRow ? "$" : ""}${p.row}`;
}

function unquoteSheet(prefix: string): string {
  const s = prefix.slice(0, -1); // '!' 제거
  return s.startsWith("'") ? s.slice(1, -1).replace(/''/g, "'") : s;
}

// 시트 접두어(선택) + A1 또는 A1:B2. 함수명(LOG10 등)은 뒤에 '('가 오므로 제외.
const REF_RE =
  /(?<![A-Za-z0-9_.!])((?:'(?:[^']|'')*'|[A-Za-z0-9_.À-￿]+)!)?(\$?)([A-Z]{1,3})(\$?)(\d+)(?::(\$?)([A-Z]{1,3})(\$?)(\d+))?(?![A-Za-z0-9_(])/g;

/** 수식 문자열의 참조를 변환. self 시트를 가리키는(접두어 없음 또는 자기 이름) 참조만 바꾼다. 범위가 통째로 지워지면 #REF!. */
export function transformFormula(formula: string, self: string, axis: Axis, op: Op): string {
  // 문자열 리터럴("…")은 건너뜀
  return formula
    .split(/("(?:[^"]|"")*")/)
    .map((seg, i) => {
      if (i % 2 === 1) return seg;
      return seg.replace(REF_RE, (whole, prefix: string | undefined, ac1, c1, ar1, r1, ac2, c2, ar2, r2) => {
        if (prefix && unquoteSheet(prefix) !== self) return whole;
        const a: RefPart = { absCol: ac1 === "$", col: colNum(c1), absRow: ar1 === "$", row: Number(r1) };
        const pre = prefix ?? "";
        if (c2 === undefined) {
          const m = mapRef(a, axis, op);
          return m ? pre + fmtRef(m) : "#REF!";
        }
        const b: RefPart = { absCol: ac2 === "$", col: colNum(c2), absRow: ar2 === "$", row: Number(r2) };
        let ma = mapRef(a, axis, op);
        let mb = mapRef(b, axis, op);
        if (op.kind === "delete") {
          // 범위 한쪽 끝만 지워지면 남은 쪽으로 줄인다
          if (!ma && mb) ma = axis === "row" ? { ...a, row: op.from } : { ...a, col: op.from };
          if (ma && !mb) mb = axis === "row" ? { ...b, row: op.from - 1 } : { ...b, col: op.from - 1 };
          if (ma && mb && (axis === "row" ? ma.row > mb.row : ma.col > mb.col)) return "#REF!";
        }
        return ma && mb ? `${pre}${fmtRef(ma)}:${fmtRef(mb)}` : "#REF!";
      });
    })
    .join("");
}

function transformCellInner(inner: string, self: string, axis: Axis, op: Op): string {
  return inner.replace(/<f([^>]*)>([\s\S]*?)<\/f>/g, (_m, attrs: string, f: string) => {
    const a = attrs.replace(/ ref="([^"]+)"/, (_r, ref: string) => ` ref="${transformFormula(ref, self, axis, op)}"`);
    return `<f${a}>${transformFormula(unescapeText(f), self, axis, op).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</f>`;
  });
}

const unescapeText = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** 범위 목록("A1:B2 C3" 또는 "A1:B2")을 변환. 통째로 지워진 범위는 뺀다. */
function transformSqref(sqref: string, axis: Axis, op: Op): string {
  return sqref
    .split(/\s+/)
    .map((r) => {
      const t = transformFormula(r, "\u0000", axis, op); // 접두어 없는 참조 → 항상 변환
      return t.includes("#REF!") ? "" : t;
    })
    .filter(Boolean)
    .join(" ");
}

/** sheetData 바깥(병합·조건부서식·유효성·x14 sqref) 참조 변환 */
function transformTail(tail: string, axis: Axis, op: Op): string {
  let t = tail.replace(/<mergeCell ref="([^"]+)"\/>/g, (_m, ref: string) => {
    const n = transformSqref(ref, axis, op);
    return n && n.includes(":") ? `<mergeCell ref="${n}"/>` : "";
  });
  t = t.replace(/<mergeCells count="\d+">/, (m) => m.replace(/\d+/, String((t.match(/<mergeCell /g) || []).length)));
  t = t.replace(/<mergeCells count="0"><\/mergeCells>/, "");
  t = t.replace(/ sqref="([^"]+)"/g, (_m, s: string) => ` sqref="${transformSqref(s, axis, op)}"`);
  t = t.replace(/<xm:sqref>([^<]+)<\/xm:sqref>/g, (_m, s: string) => `<xm:sqref>${transformSqref(s, axis, op)}</xm:sqref>`);
  // 조건부서식 수식(<formula>$H2="완료" / <xm:f>) — 상대 참조는 범위와 함께 움직인다
  t = t.replace(/<formula>([\s\S]*?)<\/formula>/g, (_m, f: string) => `<formula>${escF(transformFormula(unescapeText(f), "\u0000", axis, op))}</formula>`);
  t = t.replace(/<xm:f>([\s\S]*?)<\/xm:f>/g, (_m, f: string) => `<xm:f>${escF(transformFormula(unescapeText(f), "\u0000", axis, op))}</xm:f>`);
  // 빈 sqref가 된 조건부서식/유효성 제거
  t = t.replace(/<conditionalFormatting sqref="">[\s\S]*?<\/conditionalFormatting>/g, "");
  t = t.replace(/<dataValidation [^>]*sqref=""[^>]*>[\s\S]*?<\/dataValidation>/g, "");
  t = t.replace(/<x14:conditionalFormatting[^>]*>(?:(?!<\/x14:conditionalFormatting>)[\s\S])*?<xm:sqref><\/xm:sqref><\/x14:conditionalFormatting>/g, "");
  if (/<autoFilter ref="([^"]+)"/.test(t)) t = t.replace(/<autoFilter ref="([^"]+)"/, (_m, r: string) => `<autoFilter ref="${transformSqref(r, axis, op) || r}"`);
  return t;
}
const escF = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MAX_COL = 16384;

function transformCols(head: string, op: Op): string {
  if (op.kind === "offset") return head;
  return head.replace(/<col min="(\d+)" max="(\d+)"([^>]*)\/>/g, (whole, mi: string, ma: string, rest: string) => {
    let min = Number(mi), max = Number(ma);
    const toEnd = max === MAX_COL; // "끝까지" 정의는 끝까지 유지
    if (op.kind === "insert") {
      if (min >= op.at) { min += op.count; max += op.count; }
      else if (max >= op.at) max += op.count;
    } else {
      const n = op.to - op.from + 1;
      if (max < op.from) return whole;
      if (min > op.to) { min -= n; max -= n; }
      else { // 겹침
        const newMin = Math.min(min, op.from);
        const newMax = (max > op.to ? max - n : op.from - 1);
        if (newMax < newMin) return "";
        min = newMin; max = newMax;
      }
    }
    if (toEnd) max = MAX_COL;
    if (min > MAX_COL) return "";
    return `<col min="${min}" max="${Math.min(max, MAX_COL)}"${rest}/>`;
  });
}

function shiftAll(s: Sheet, axis: Axis, op: Op): void {
  for (const row of s.rows) {
    if (axis === "row" && op.kind !== "offset") {
      const nr = applyOp(row.r, true, op);
      row.r = nr ?? -1;
    }
    for (const c of row.cells) {
      if (axis === "col" && op.kind !== "offset") c.col = applyOp(c.col, true, op) ?? -1;
      if (c.inner.includes("<f")) c.inner = transformCellInner(c.inner, s.name, axis, op);
    }
    row.cells = row.cells.filter((c) => c.col > 0);
  }
  s.rows = s.rows.filter((r) => r.r > 0);
  s.tail = transformTail(s.tail, axis, op);
  if (axis === "col") s.head = transformCols(s.head, op);
}

// ── 행 ──────────────────────────────────────────────────────────────────────
/** 값·캐시 없는 복제 셀: 수식은 상대 참조를 오프셋만큼 옮기고, 값 셀은 서식만 남긴다 */
function cloneCell(c: Cell, self: string, axis: Axis, by: number): Cell {
  const f = c.inner.match(/<f\b[^>]*>[\s\S]*?<\/f>|<f\b[^>]*\/>/)?.[0];
  if (!f || /t="shared"/.test(f)) return { col: c.col, attrs: c.attrs.replace(/ t="[^"]*"/, ""), inner: "" };
  const inner = transformCellInner(f, self, axis, { kind: "offset", by });
  return { col: c.col, attrs: c.attrs.replace(/ t="[^"]*"/, ""), inner };
}

/** at 위치에 count행 삽입(기존 at행부터 아래로 밀림, 엑셀 '행 삽입'). 새 행은 비어 있다 — writeRowClone으로 채운다. */
export function insertRows(s: Sheet, at: number, count: number): void {
  if (count <= 0) return;
  shiftAll(s, "row", { kind: "insert", at, count });
}

/** 행 복사본(삽입·이동 전에 떠 둔다) */
export function snapshotRow(s: Sheet, r: number): Row {
  const row = getRow(s, r);
  return { r: row.r, attrs: row.attrs, cells: row.cells.map((c) => ({ ...c })) };
}

/** 템플릿 행(스냅샷)을 r행에 '아래로 채우기'로 써 넣는다(값은 비우고 서식·수식만) */
export function writeRowClone(s: Sheet, tpl: Row, r: number): void {
  const row = getRow(s, r);
  row.attrs = tpl.attrs.replace(/ hidden="1"/, "");
  row.cells = tpl.cells.map((c) => cloneCell(c, s.name, "row", r - tpl.r));
}

export function deleteRows(s: Sheet, from: number, to: number): void {
  s.rows = s.rows.filter((r) => r.r < from || r.r > to);
  shiftAll(s, "row", { kind: "delete", from, to });
}

export function getRow(s: Sheet, r: number): Row {
  let row = s.rows.find((x) => x.r === r);
  if (!row) {
    row = { r, attrs: "", cells: [] };
    s.rows.push(row);
  }
  return row;
}

export function setRowHidden(s: Sheet, r: number, hidden: boolean): void {
  const row = getRow(s, r);
  row.attrs = row.attrs.replace(/ hidden="1"/, "") + (hidden ? ' hidden="1"' : "");
}

// ── 열 ──────────────────────────────────────────────────────────────────────
/** at 열 위치에 count열 삽입(엑셀 '열 삽입'). 새 열은 비어 있다 — writeColClone으로 채운다. */
export function insertCols(s: Sheet, at: number, count: number): void {
  if (count <= 0) return;
  shiftAll(s, "col", { kind: "insert", at, count });
}

export interface ColSnapshot {
  col: number;
  cells: { r: number; cell: Cell }[];
  merges: string[]; // 이 열 묶음 안에 완전히 들어가는 병합 (from..to 열 묶음 기준)
}

/** 연속 열 묶음(from..to)의 복사본 — 셀·병합 */
export function snapshotCols(s: Sheet, from: number, to: number): ColSnapshot[] {
  const out: ColSnapshot[] = [];
  for (let col = from; col <= to; col++) {
    const cells: { r: number; cell: Cell }[] = [];
    for (const row of s.rows) {
      const c = row.cells.find((x) => x.col === col);
      if (c) cells.push({ r: row.r, cell: { ...c } });
    }
    out.push({ col, cells, merges: [] });
  }
  const merges = [...s.tail.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g)]
    .filter((m) => colNum(m[1]) >= from && colNum(m[3]) <= to)
    .map((m) => m[0].match(/ref="([^"]+)"/)![1]);
  out[0].merges = merges;
  return out;
}

/** 템플릿 열 묶음(스냅샷)을 firstCol부터 '오른쪽으로 채우기'로 써 넣는다(값은 비우고 서식·수식·병합) */
export function writeColsClone(s: Sheet, tpl: ColSnapshot[], firstCol: number): void {
  const by = firstCol - tpl[0].col;
  for (const t of tpl) {
    const col = t.col + by;
    for (const { r, cell } of t.cells) {
      const row = getRow(s, r);
      row.cells = row.cells.filter((x) => x.col !== col);
      row.cells.push({ ...cloneCell(cell, s.name, "col", by), col });
    }
  }
  const add = tpl[0].merges
    .map((ref) => transformFormula(ref, "\u0000", "col", { kind: "offset", by }))
    .filter((ref) => !s.tail.includes(`<mergeCell ref="${ref}"/>`))
    .map((ref) => `<mergeCell ref="${ref}"/>`)
    .join("");
  if (add) {
    s.tail = /<mergeCells /.test(s.tail)
      ? s.tail.replace(/<mergeCells count="\d+">([\s\S]*?)<\/mergeCells>/, (_m, body: string) => `<mergeCells count="0">${body}${add}</mergeCells>`)
      : s.tail.replace("</sheetData>", `</sheetData><mergeCells count="0">${add}</mergeCells>`);
    s.tail = s.tail.replace(/<mergeCells count="\d+">/, `<mergeCells count="${(s.tail.match(/<mergeCell /g) || []).length}">`);
  }
}

export function deleteCols(s: Sheet, from: number, to: number): void {
  for (const row of s.rows) row.cells = row.cells.filter((c) => c.col < from || c.col > to);
  shiftAll(s, "col", { kind: "delete", from, to });
}

/** from..to 열 숨김/해제 — <cols> 경계를 쪼개 hidden 속성을 붙인다 */
export function setColsHidden(s: Sheet, from: number, to: number, hidden: boolean): void {
  const colsM = s.head.match(/<cols>([\s\S]*?)<\/cols>/);
  const defs = colsM ? [...colsM[1].matchAll(/<col min="(\d+)" max="(\d+)"([^>]*)\/>/g)].map((m) => ({ min: Number(m[1]), max: Number(m[2]), rest: m[3] })) : [];
  const out: { min: number; max: number; rest: string }[] = [];
  for (const d of defs) {
    // 경계에서 쪼갠다
    const cuts = [d.min, from, to + 1, d.max + 1].filter((x) => x >= d.min && x <= d.max + 1).sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) if (cuts[i] < cuts[i + 1]) out.push({ min: cuts[i], max: cuts[i + 1] - 1, rest: d.rest });
  }
  const covered = (c: number) => out.some((d) => d.min <= c && c <= d.max);
  for (let c = from; c <= to; c++) if (!covered(c)) out.push({ min: c, max: c, rest: ' width="9" customWidth="1"' });
  for (const d of out) {
    if (d.max < from || d.min > to) continue;
    d.rest = d.rest.replace(/ hidden="1"/, "") + (hidden ? ' hidden="1"' : "");
  }
  out.sort((a, b) => a.min - b.min);
  const xml = `<cols>${out.map((d) => `<col min="${d.min}" max="${d.max}"${d.rest}/>`).join("")}</cols>`;
  s.head = colsM ? s.head.replace(colsM[0], xml) : s.head.replace("<sheetData>", xml + "<sheetData>");
}

// ── 셀 값 ───────────────────────────────────────────────────────────────────
export function getCell(s: Sheet, col: number, r: number): Cell {
  const row = getRow(s, r);
  let c = row.cells.find((x) => x.col === col);
  if (!c) {
    c = { col, attrs: "", inner: "" };
    row.cells.push(c);
  }
  return c;
}

/** 값 설정(서식 유지). number → 숫자, string → inlineStr, null → 빈 셀. 수식은 제거된다. */
export function setValue(s: Sheet, col: number, r: number, v: number | string | null): void {
  const c = getCell(s, col, r);
  const sAttr = c.attrs.match(/ s="\d+"/)?.[0] ?? "";
  if (v === null || v === "") {
    c.attrs = sAttr;
    c.inner = "";
  } else if (typeof v === "number") {
    c.attrs = sAttr;
    c.inner = `<v>${v}</v>`;
  } else {
    c.attrs = `${sAttr} t="inlineStr"`;
    c.inner = `<is><t xml:space="preserve">${escXml(v)}</t></is>`;
  }
}

export function setFormula(s: Sheet, col: number, r: number, formula: string): void {
  const c = getCell(s, col, r);
  c.attrs = c.attrs.match(/ s="\d+"/)?.[0] ?? "";
  c.inner = `<f>${escF(formula)}</f>`;
}

export function setStyle(s: Sheet, col: number, r: number, styleId: string | undefined): void {
  const c = getCell(s, col, r);
  c.attrs = c.attrs.replace(/ s="\d+"/, "") + (styleId ? ` s="${styleId}"` : "");
}

export const styleOf = (c: Cell | undefined) => c?.attrs.match(/ s="(\d+)"/)?.[1];

/** 셀의 수식 텍스트(없으면 null) */
export function formulaOf(c: Cell | undefined): string | null {
  const m = c?.inner.match(/<f\b[^>]*>([\s\S]*?)<\/f>/);
  return m ? unescapeText(m[1]) : null;
}

// ── 정리 ─────────────────────────────────────────────────────────────────────
/** 공유 수식(t="shared")을 셀마다 독립 수식으로 풀어 쓴다(삽입·복제가 단순해진다) */
export function materializeShared(s: Sheet): void {
  const masters = new Map<string, { text: string; col: number; row: number }>();
  for (const row of s.rows)
    for (const c of row.cells) {
      const m = c.inner.match(/<f t="shared"[^>]*\bsi="(\d+)"[^>]*>([\s\S]*?)<\/f>/);
      if (m) masters.set(m[1], { text: unescapeText(m[2]), col: c.col, row: row.r });
    }
  for (const row of s.rows)
    for (const c of row.cells) {
      const m = c.inner.match(/<f t="shared"[^>]*\bsi="(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/f>)/);
      if (!m) continue;
      const master = masters.get(m[1]);
      if (!master) continue;
      let f = transformFormula(master.text, s.name, "row", { kind: "offset", by: row.r - master.row });
      f = transformFormula(f, s.name, "col", { kind: "offset", by: c.col - master.col });
      c.inner = c.inner.replace(m[0], `<f>${escF(f)}</f>`);
    }
}

/** 수식 셀의 캐시 값(<v>·t="str")을 지운다 — 열 때 재계산(fullCalcOnLoad)하므로 옛 값이 보일 일이 없다 */
export function stripFormulaValues(s: Sheet): void {
  for (const row of s.rows)
    for (const c of row.cells) {
      const f = c.inner.match(/<f\b[^>]*>[\s\S]*?<\/f>|<f\b[^>]*\/>/)?.[0];
      if (!f) continue;
      c.inner = f;
      c.attrs = c.attrs.replace(/ t="[^"]*"/, "");
    }
}

// ── 워크북 ──────────────────────────────────────────────────────────────────
/** workbook.xml + rels → 시트 이름 → 경로(xl/worksheets/sheetN.xml) */
export function sheetPathsByName(workbookXml: string, relsXml: string): Map<string, string> {
  const rid = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/ Id="([^"]+)"/)?.[1];
    const target = m[0].match(/ Target="([^"]+)"/)?.[1];
    if (id && target) rid.set(id, "xl/" + target.replace(/^\/?xl\//, ""));
  }
  const out = new Map<string, string>();
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = m[0].match(/ name="([^"]+)"/)?.[1];
    const id = m[0].match(/ r:id="([^"]+)"/)?.[1];
    const path = id && rid.get(id);
    if (name && path) out.set(unescapeText(name), path);
  }
  return out;
}

export function setFullCalcOnLoad(workbookXml: string): string {
  if (/<calcPr\b[^>]*fullCalcOnLoad=/.test(workbookXml)) return workbookXml;
  if (/<calcPr\b/.test(workbookXml)) return workbookXml.replace(/<calcPr\b([^>]*?)(\/?)>/, (_m, a: string, sc: string) => `<calcPr${a} fullCalcOnLoad="1"${sc}>`);
  return workbookXml.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
}
