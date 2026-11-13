// 운수사 배차표 엑셀(한 시트에 노선 블록이 여러 개 흩어진 양식) 파서 — 노선별 배차표용.
//   블록 = 제목("6015 (명동) _ 평일  T1-17") → 머리글 행('차번'·'성명'·정류장…) → (T2/T1 보조 머리글) → 차량 행들.
//   블록은 '차번' 칸을 기준으로 찾고, 차번 칸이 숫자인 동안을 그 블록의 차량으로 본다.
//   차량마다 가장 왼쪽 시간 = 그날 첫 출발. 그 시간이 04:00~08:59 인 차량만 남긴다.
//   '평일시간표'/'토·휴일시간표' 세로 글자 칸으로 평일·휴일 구역을 가른다.
import * as XLSX from "xlsx";
import { WINDOW_FROM, WINDOW_TO, plateOf, type RouteDispatchBlock } from "@/lib/route-dispatch";

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function timeOf(v: unknown): string | null {
  if (typeof v === "number") {
    const min = Math.round((((v % 1) + 1) % 1) * 1440) % 1440;
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  }
  const m = /^\(?(\d{1,2}):(\d{2})\)?$/.exec(String(v ?? "").trim());
  return m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

export function parseRouteDispatch(buf: Buffer, company: string): { date: string; blocks: RouteDispatchBlock[] } {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws["!ref"]) throw new Error("시트가 없습니다.");
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const raw = (r: number, c: number): unknown => ws[XLSX.utils.encode_cell({ r, c })]?.v ?? "";
  // 병합 칸은 왼쪽 위 칸 값으로 읽는다(세로로 병합된 메모·가로로 병합된 머리글)
  const owner = new Map<string, [number, number]>();
  for (const m of ws["!merges"] ?? []) {
    for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) owner.set(`${r},${c}`, [m.s.r, m.s.c]);
  }
  const get = (r: number, c: number): unknown => {
    const o = owner.get(`${r},${c}`);
    return o ? raw(o[0], o[1]) : raw(r, c);
  };
  const isText = (v: unknown) => typeof v === "string" && v.trim() !== "";

  let date = "";
  const marks: [row: number, day: string][] = [];
  const heads: [number, number][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = raw(r, c);
      if (typeof v === "number") {
        if (!date && v > 40000 && v < 60000) {
          const d = XLSX.SSF.parse_date_code(v);
          date = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
        }
        continue;
      }
      const s = String(v).replace(/\s+/g, "");
      if (s === "차번") heads.push([r, c]);
      else if (s === "평일시간표") marks.push([r, "평일"]);
      else if (/^토.?휴일시간표$/.test(s)) marks.push([r, "토·휴일"]);
    }
  }
  if (heads.length === 0) throw new Error("'차번' 머리글을 찾지 못했습니다. 배차표 파일인지 확인하세요.");

  const blocks: RouteDispatchBlock[] = [];
  for (const [hr, c0] of heads) {
    // 제목 — 머리글 위 1~3행, 차번 칸과 같은 열
    let title = "";
    for (let r = hr - 1; r >= Math.max(0, hr - 3) && !title; r--) {
      const v = raw(r, c0);
      if (typeof v === "string" && /^N?\d{3,4}/.test(v.trim())) title = squash(v);
    }
    const tm = /^(N?\d{3,4}(?:-\d+)?)\s*번?\s*(\([^)]*\))?/.exec(title);
    const route = tm ? squash(`${tm[1]} ${tm[2] ?? ""}`) : title || "노선 미상";
    const day =
      [...marks].reverse().find(([r]) => r <= hr)?.[1] ?? (/토.?휴일/.test(title) ? "토·휴일" : /평일/.test(title) ? "평일" : "");

    // 블록 오른쪽 끝 — 머리글(또는 보조 머리글)이 글자인 동안. 옆 블록의 차량 행(숫자)·빈 칸·다른 '차번'에서 멈춘다.
    let cEnd = c0 + 1;
    for (let c = c0 + 2; c <= range.e.c; c++) {
      if (String(raw(hr, c)).replace(/\s+/g, "") === "차번") break;
      if (!isText(get(hr, c)) && !isText(get(hr + 1, c))) break;
      cEnd = c;
    }
    const label = (c: number) =>
      [...new Set([get(hr, c), get(hr + 1, c)].filter(isText).map((v) => squash(String(v))))].join(" ");

    const rows: RouteDispatchBlock["rows"] = [];
    let r = hr + 1;
    if (typeof raw(r, c0) !== "number") r++; // 보조 머리글 행(T2/T1)
    for (; r <= range.e.r && typeof raw(r, c0) === "number"; r++) {
      let first = -1;
      const notes: string[] = [];
      for (let c = c0 + 2; c <= cEnd; c++) {
        const v = get(r, c);
        if (timeOf(v)) {
          first = c;
          break;
        }
        if (isText(v)) notes.push(squash(String(v)));
      }
      if (first < 0) continue;
      const time = timeOf(get(r, first))!;
      if (time < WINDOW_FROM || time >= WINDOW_TO) continue;
      const after = first < cEnd ? get(r, first + 1) : "";
      if (isText(after) && !timeOf(after)) notes.push(squash(String(after)));
      const no = raw(r, c0) as number;
      rows.push({
        no,
        plate: plateOf(company, no),
        time,
        from: label(first),
        note: [...new Set(notes)].join(" · "),
      });
    }
    if (rows.length === 0) continue;
    rows.sort((a, b) => a.time.localeCompare(b.time) || a.no - b.no);
    blocks.push({ route, day, rows });
  }
  if (blocks.length === 0) throw new Error("04시~09시 사이에 출발하는 차량을 찾지 못했습니다.");
  return { date, blocks };
}
