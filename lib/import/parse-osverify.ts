// OS업데이트 적용 검증용 파일 4종(.xls) 파서 — 차량번호 기준으로 "완료 조건 충족 여부"만 뽑는다.
//   fault : 단말기장애목록 — G차량번호, L접수오류유형=기타, AH현장처리유형="F/W, OS 적용", AL처리내용에 "개선OS 업데이트"(띄어쓰기 무시) → 자산등록 완료
//   b710  : 차세대마을버스단말기 OS버전 조회 — B차량번호(괄호 앞), C AFC보드=32/32, D BMS보드=32/32
//   b700  : CITS시내버스단말기 OS버전 조회 — B차량번호, C AFC-램디스크=40, D AFC-커널=39, F BMS-램디스크=40, G BMS-커널=39
//   b800  : B800버스 OS버전 조회 — B차량번호, C 램디스크=19, D 커널=19(AFC), F 램디스크=19, G 커널=19(BMS)
//   열 위치는 머리글로 한 번 확인하고(없으면 기본 열), 같은 차량이 여러 행이면 하나라도 충족하면 완료.
import * as XLSX from "xlsx";
import { normPlate } from "./parse-terminal-xls";
import { OS_FILE_LABEL, type OsFileType } from "./osverify-types";
export { OS_FILE_LABEL, OS_FILE_TYPES, OS_RULE_TEXT, type OsFileType } from "./osverify-types";

export interface OsRow {
  plate: string;
  ok: boolean;
  info: string; // 판정 근거(버전값 등) — 미달 사유 표시용
}

const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, "");
/** "서울70사6611(111706611)" → "서울70사6611" */
export const filePlate = (v: unknown) => normPlate(v).replace(/\(.*$/, "");

/** 기종 문자열 → OS 파일 종류(B800/B700/B710). 모르면 null */
export function osTypeOfModel(model: string | null | undefined): Exclude<OsFileType, "fault"> | null {
  const m = (model ?? "").toUpperCase();
  if (m.includes("B800")) return "b800";
  if (m.includes("B700")) return "b700";
  if (m.includes("B710")) return "b710";
  return null;
}

// 열 인덱스(0-based) 기본값 + 머리글 키워드
const COLS: Record<OsFileType, { plate: number; cols: number[]; keys: string[] }> = {
  fault: { plate: 6, cols: [11, 33, 37], keys: ["접수오류유형", "현장처리유형", "처리내용"] },
  b710: { plate: 1, cols: [2, 3], keys: ["AFC보드", "BMS보드"] },
  b700: { plate: 1, cols: [2, 3, 5, 6], keys: ["AFC-램디스크버전", "AFC-커널버전", "BMS-램디스크버전", "BMS-커널버전"] },
  b800: { plate: 1, cols: [2, 3, 5, 6], keys: [] }, // B800 은 머리글이 '램디스크버전'이 반복돼 열 고정(C·D=AFC, F·G=BMS)
};

const judge: Record<OsFileType, (v: string[]) => boolean> = {
  fault: ([type, action, memo]) => type === "기타" && action === "F/W,OS적용" && /개선OS업데이트/.test(memo),
  b710: ([afc, bms]) => afc === "32/32" && bms === "32/32",
  b700: ([ar, ak, br, bk]) => ar === "40" && ak === "39" && br === "40" && bk === "39",
  b800: ([ar, ak, br, bk]) => ar === "19" && ak === "19" && br === "19" && bk === "19",
};

export function parseOsFile(buf: Buffer, type: OsFileType): OsRow[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("시트가 없습니다.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
  const spec = COLS[type];
  let plateCol = spec.plate;
  let cols = [...spec.cols];
  let hdr = -1;
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const cells = (rows[r] ?? []).map((c) => norm(c));
    const p = cells.findIndex((c) => c.includes("차량번호"));
    if (p < 0) continue;
    hdr = r;
    plateCol = p;
    if (spec.keys.length) {
      const found = spec.keys.map((k) => cells.findIndex((c) => c.includes(k.replace(/\s+/g, ""))));
      if (found.every((i) => i >= 0)) cols = found;
    }
    break;
  }
  if (hdr < 0) throw new Error("머리글에 '차량번호' 열이 없습니다. " + OS_FILE_LABEL[type] + " 조회 파일인지 확인하세요.");

  const byPlate = new Map<string, OsRow>();
  for (let r = hdr + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const plate = filePlate(row[plateCol]);
    if (!plate) continue;
    const vals = cols.map((c) => norm(row[c]));
    const ok = judge[type](vals);
    const info = type === "fault" ? vals.slice(0, 2).join("/") : type === "b710" ? `AFC ${vals[0] || "-"} · BMS ${vals[1] || "-"}` : `AFC ${vals[0] || "-"}/${vals[1] || "-"} · BMS ${vals[2] || "-"}/${vals[3] || "-"}`;
    const cur = byPlate.get(plate);
    if (!cur || (!cur.ok && ok)) byPlate.set(plate, { plate, ok, info });
  }
  if (!byPlate.size) throw new Error("차량 행이 없습니다.");
  return [...byPlate.values()];
}
