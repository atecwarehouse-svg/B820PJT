// 차량단말기버전 조회 파일(.xls/.xlsx) 파서 — 양도양수 서버 등록 검증용.
//   1~10행에서 '차량번호'·'단말기' 머리글을 찾는다(없으면 G/N열). 차량 1대 = 단말기 행 5개:
//   55000…(1개) + 56000…(1개) + 1560…(3개). 같은 차량·같은 단말기ID 중복 행은 1개로 센다.
import * as XLSX from "xlsx";

export interface TerminalRow {
  plate: string;
  ids: string[]; // 단말기ID(중복 제거)
}

export const TERMINAL_RULE = [
  { prefix: "55000", need: 1 },
  { prefix: "56000", need: 1 },
  { prefix: "1560", need: 3 },
] as const;

export const normPlate = (s: unknown) => String(s ?? "").replace(/\s+/g, "").trim();

export function parseTerminalBuffer(buf: Buffer): TerminalRow[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("시트가 없습니다.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
  let hdr = -1;
  let pc = 6; // G
  let ic = 13; // N
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const cells = (rows[r] ?? []).map((c) => String(c ?? ""));
    const p = cells.findIndex((c) => c.includes("차량번호"));
    if (p < 0) continue;
    const i = cells.findIndex((c) => c.includes("단말기") && c.includes("ID"));
    hdr = r;
    pc = p;
    if (i >= 0) ic = i;
    break;
  }
  if (hdr < 0) throw new Error("'차량번호' 머리글을 찾지 못했습니다. 차량단말기버전 조회 파일인지 확인하세요.");

  const m = new Map<string, Set<string>>();
  for (let r = hdr + 1; r < rows.length; r++) {
    const plate = normPlate(rows[r]?.[pc]);
    const id = String(rows[r]?.[ic] ?? "").trim();
    if (!plate) continue;
    const s = m.get(plate) ?? new Set<string>();
    if (id) s.add(id);
    m.set(plate, s);
  }
  return [...m.entries()].map(([plate, ids]) => ({ plate, ids: [...ids] }));
}

/** 규칙별 개수 + 충족 여부 */
export function checkTerminal(ids: string[]): { ok: boolean; counts: number[]; missing: string } {
  const counts = TERMINAL_RULE.map((r) => ids.filter((id) => id.startsWith(r.prefix)).length);
  const missing = TERMINAL_RULE.map((r, i) => (counts[i] < r.need ? `${r.prefix}… ${counts[i]}/${r.need}` : null))
    .filter(Boolean)
    .join(", ");
  return { ok: !missing, counts, missing };
}
