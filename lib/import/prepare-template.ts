/**
 * 일정 업로드 파일 → 다운로드 템플릿 자동 교체용 검증·전처리.
 *
 * 배경: 다운로드 엑셀은 Storage 템플릿(전개일정·진행현황 골격)을 채워 만드는데,
 * 노선명 변경·일정 재편성 파일을 DB에만 반영하고 템플릿을 안 바꾸면
 * 대상수량 델타 보정이 어긋난다(새 노선명 행을 옛 전개일정에서 못 찾음 → 총대수 오차).
 * → 업로드 파일이 완전한 양식이면 반영 시 템플릿도 같은 파일로 교체한다.
 *
 * 검증: 차량리스트·전개일정·진행현황(이름 포함) 시트 존재 여부.
 * 경고: 전개일정 E열(대상수량) 합 ≠ 차량리스트 대수 — 양식 자체 모순(수기 수정 누락 등).
 * 전처리: calcChain.xml 제거(Excel이 열 때 재생성) — 재저장본의 잔존 calcChain이
 *   다운로드 셀 수술과 어긋나는 문제 예방(기존 수동 교체 절차와 동일).
 */

import ExcelJS from "exceljs";
import JSZip from "jszip";
import { txt } from "./parse-schedule";

export interface TemplateCheck {
  ok: boolean; // 템플릿으로 교체 가능한가
  reason?: string; // ok=false 사유
  warn?: string; // ok여도 알려줄 경고(수량 모순 등)
  buffer?: Buffer; // 교체용 전처리된 버퍼 (checkOnly면 없음)
}

// 셀 값 → 숫자 (수식 셀은 캐시된 result 사용)
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return num(o.result);
    return null;
  }
  const n = Number(v);
  return isFinite(n) ? n : null;
}

export async function prepareTemplateBuffer(
  buf: Buffer,
  opts?: { checkOnly?: boolean },
): Promise<TemplateCheck> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    return { ok: false, reason: "엑셀을 읽을 수 없어 다운로드 양식은 교체하지 않습니다." };
  }

  const names = wb.worksheets.map((w) => w.name);
  const missing: string[] = [];
  if (!names.includes("차량리스트")) missing.push("차량리스트");
  if (!names.includes("전개일정")) missing.push("전개일정");
  if (!names.some((n) => n.includes("진행현황"))) missing.push("진행현황");
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `「${missing.join("」·「")}」 시트가 없어 다운로드 양식은 교체하지 않습니다.`,
    };
  }

  // 자체 정합 검사: 전개일정 대상수량(E열) 합 vs 차량리스트 대수.
  // (이 둘이 다른 채로 템플릿이 되면 진행현황 총대수가 DB와 어긋난다)
  let warn: string | undefined;
  const vws = wb.getWorksheet("차량리스트")!;
  let vCount = 0;
  for (let r = 2; r <= vws.rowCount; r++) {
    if (txt(vws.getRow(r).getCell("F").value)) vCount++;
  }
  const sws = wb.getWorksheet("전개일정")!;
  let eSum = 0;
  let eUnknown = false; // 수식 캐시 없음 등으로 값을 못 읽으면 검사 포기(오탐 방지)
  for (let r = 5; r <= sws.rowCount; r++) {
    const row = sws.getRow(r);
    const op = txt(row.getCell("A").value);
    if (!op || op === "합계") continue;
    const e = num(row.getCell("E").value);
    if (e == null) {
      eUnknown = true;
      break;
    }
    eSum += e;
  }
  if (!eUnknown && eSum !== vCount) {
    warn = `이 파일의 전개일정 대상수량 합(${eSum.toLocaleString()})과 차량리스트 대수(${vCount.toLocaleString()})가 다릅니다. 진행현황 총대수가 어긋날 수 있으니 양식 숫자를 확인해주세요.`;
  }

  if (opts?.checkOnly) return { ok: true, warn };

  // calcChain 제거 (Content_Types·rels 참조도 함께 — Excel이 열 때 자동 재생성)
  const zip = await JSZip.loadAsync(buf);
  if (!zip.file("xl/calcChain.xml")) return { ok: true, warn, buffer: buf };
  zip.remove("xl/calcChain.xml");
  const ct = zip.file("[Content_Types].xml");
  if (ct) {
    const x = await ct.async("string");
    zip.file(
      "[Content_Types].xml",
      x.replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ""),
    );
  }
  const rels = zip.file("xl/_rels/workbook.xml.rels");
  if (rels) {
    const x = await rels.async("string");
    zip.file(
      "xl/_rels/workbook.xml.rels",
      x.replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/, ""),
    );
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { ok: true, warn, buffer };
}
