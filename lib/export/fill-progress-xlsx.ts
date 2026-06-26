// 진행현황 양식(.xlsx) 외과적 채움 — ExcelJS로 다시 쓰지 않고 zip 안의
// 시트 XML을 직접 수정한다. → 피벗(Sheet1/Sheet11)·차트·다른 시트의 함수가 100% 보존된다.
//
// 동작 원리: 집계 시트(진행현황/전개일정)는 전부 COUNTIFS로 차량리스트 G("완료")·H(완료일)만
// 보고 자동 계산된다. 따라서 G/H만 채우고 workbook의 fullCalcOnLoad를 켜면 Excel이 열릴 때
// 전 시트를 재계산한다.
//
// 증차(마스터 차량리스트에 없는 완료 차량)는:
//   ① 차량리스트 시트에 행을 추가(운수사·노선·차량번호·완료·완료일)하고,
//   ② 전개일정의 해당 영업소(운수사+노선) 대상수량(C열)을 증차 수만큼 올린다.
// → 전개일정의 MIN(대상수량, 완료수)에 가려지지 않고 진행현황 숫자에 정확히 반영된다.
//   (진행현황 시트의 대상대수/완료수량은 전개일정을 참조하므로 자동 연동.)

import JSZip from "jszip";

const VEHICLE_SHEET = "xl/worksheets/sheet4.xml"; // 차량리스트
const SCHEDULE_SHEET = "xl/worksheets/sheet3.xml"; // 전개일정
const PROGRESS_SHEET = "xl/worksheets/sheet2.xml"; // 인천버스 B800단말기 설치 진행현황
const WORKBOOK = "xl/workbook.xml";

// 증차 추가 행에 재사용할 셀 스타일(차량리스트 데이터 행과 동일)
const STYLE = { op: "121", route: "88", plate: "122", done: "123", date: "124" };

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// sharedStrings.xml → 문자열 배열 (각 <si>의 <t>들을 이어붙임)
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = "";
    for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += unescapeXml(t[1]);
    out.push(text);
  }
  return out;
}

// <c> 셀의 표시값 복원 (공유문자열/인라인/숫자)
function cellValue(attrs: string, inner: string, shared: string[]): string {
  if (/t="s"/.test(attrs)) {
    const v = inner.match(/<v>(\d+)<\/v>/);
    return v ? shared[Number(v[1])] ?? "" : "";
  }
  if (/t="(inlineStr|str)"/.test(attrs)) {
    const t = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
    return t ? unescapeXml(t[1]) : "";
  }
  const v = inner.match(/<v>([\s\S]*?)<\/v>/);
  return v ? v[1] : "";
}

export interface CompletedInfo {
  serial: number; // 완료일 Excel 직렬값
  operator: string; // 증차 append/매칭용 운수사
  route: string; // 증차 append/매칭용 노선
}

interface FillResult {
  buffer: Buffer;
  filled: number; // 차량리스트 기존 행에 G/H 채운 수
  added: number; // 증차로 새 행 추가한 수
}

/**
 * 템플릿 버퍼 + 완료맵(plate → {직렬값,운수사,노선})을 받아 채운 새 xlsx 버퍼를 반환.
 * - 차량리스트에 있는 차량: G="완료", H=완료일.
 * - 없는 차량(증차): 행 추가 + 전개일정 대상수량 보정.
 */
export async function fillProgressXlsx(
  templateBuffer: Buffer,
  completed: Map<string, CompletedInfo>,
  asOfSerial?: number, // 진행현황 시트 기준일(A10:C10) — 다운로드 시점 업무일
  plannedQty?: number, // 진행현황 시트 계획수량(A6:B6 병합) — 다운로드 전 입력값
): Promise<FillResult> {
  const zip = await JSZip.loadAsync(templateBuffer);

  const vFile = zip.file(VEHICLE_SHEET);
  const sFile = zip.file(SCHEDULE_SHEET);
  const ssFile = zip.file("xl/sharedStrings.xml");
  const wbFile = zip.file(WORKBOOK);
  if (!vFile || !ssFile || !wbFile) {
    throw new Error("양식 구조가 예상과 다릅니다 (sheet4/sharedStrings/workbook 누락).");
  }

  const shared = parseSharedStrings(await ssFile.async("string"));
  let sheetXml = await vFile.async("string");

  // 1) F 셀(차량번호) 스캔 → 차량리스트에 있는 완료 차량의 행 → 직렬값
  const rowSerial = new Map<number, number>();
  const matchedPlates = new Set<string>();
  for (const m of sheetXml.matchAll(/<c r="F(\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
    const row = Number(m[1]);
    const plate = cellValue(m[2], m[3], shared).trim();
    if (plate && completed.has(plate)) {
      rowSerial.set(row, completed.get(plate)!.serial);
      matchedPlates.add(plate);
    }
  }

  // 2) 기존 행 G/H 채움
  const seenG = new Set<number>();
  sheetXml = sheetXml.replace(
    /<c r="([GH])(\d+)"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g,
    (whole, col: string, rowStr: string, attrs: string) => {
      const row = Number(rowStr);
      if (!rowSerial.has(row)) return whole;
      const sMatch = attrs.match(/\bs="(\d+)"/);
      const s = sMatch ? ` s="${sMatch[1]}"` : "";
      if (col === "G") {
        seenG.add(row);
        return `<c r="G${row}"${s} t="inlineStr"><is><t>완료</t></is></c>`;
      }
      return `<c r="H${row}"${s}><v>${rowSerial.get(row)}</v></c>`;
    },
  );
  const filled = seenG.size;

  // 3) 증차 = 완료맵에 있으나 차량리스트에 없는 차량
  const added: { plate: string; serial: number; operator: string; route: string }[] = [];
  const bumpByGroup = new Map<string, { operator: string; route: string; count: number }>();
  for (const [plate, info] of completed) {
    if (matchedPlates.has(plate)) continue;
    added.push({ plate, serial: info.serial, operator: info.operator, route: info.route });
    const key = `${info.operator}|||${info.route}`;
    const g = bumpByGroup.get(key) ?? { operator: info.operator, route: info.route, count: 0 };
    g.count++;
    bumpByGroup.set(key, g);
  }

  // 3-a) 차량리스트에 증차 행 추가
  if (added.length > 0) {
    let maxRow = 0;
    for (const m of sheetXml.matchAll(/<row r="(\d+)"/g)) maxRow = Math.max(maxRow, Number(m[1]));
    let rowsXml = "";
    let rn = maxRow;
    for (const a of added) {
      rn++;
      rowsXml +=
        `<row r="${rn}" spans="1:37">` +
        `<c r="B${rn}" s="${STYLE.op}" t="inlineStr"><is><t>${escapeXml(a.operator)}</t></is></c>` +
        `<c r="C${rn}" s="${STYLE.route}" t="inlineStr"><is><t>${escapeXml(a.route)}</t></is></c>` +
        `<c r="F${rn}" s="${STYLE.plate}" t="inlineStr"><is><t>${escapeXml(a.plate)}</t></is></c>` +
        `<c r="G${rn}" s="${STYLE.done}" t="inlineStr"><is><t>완료</t></is></c>` +
        `<c r="H${rn}" s="${STYLE.date}"><v>${a.serial}</v></c>` +
        `</row>`;
    }
    sheetXml = sheetXml.replace("</sheetData>", rowsXml + "</sheetData>");
    sheetXml = sheetXml.replace(
      /<dimension ref="([A-Z]+)1:([A-Z]+)\d+"\/>/,
      (_m, a: string, b: string) => `<dimension ref="${a}1:${b}${rn}"/>`,
    );
  }

  zip.file(VEHICLE_SHEET, sheetXml);

  // 3-b) 전개일정 대상수량(C열) 보정 — 증차 영업소만큼 올림
  if (bumpByGroup.size > 0 && sFile) {
    let schedXml = await sFile.async("string");
    schedXml = schedXml.replace(
      /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g,
      (whole, _rn: string, inner: string) => {
        const aCell = inner.match(/<c r="A\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/);
        const bCell = inner.match(/<c r="B\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/);
        if (!aCell || !bCell) return whole;
        const op = cellValue(aCell[1], aCell[2] ?? "", shared).trim();
        const rt = cellValue(bCell[1], bCell[2] ?? "", shared).trim();
        const g = bumpByGroup.get(`${op}|||${rt}`);
        if (!g) return whole;
        // C열 대상수량 숫자에 증차 수 더하기
        const newInner = inner.replace(
          /(<c r="C\d+"[^>]*>)<v>(\d+(?:\.\d+)?)<\/v>(<\/c>)/,
          (_cm, pre: string, num: string, post: string) =>
            `${pre}<v>${Number(num) + g.count}</v>${post}`,
        );
        return whole.replace(inner, newInner);
      },
    );
    zip.file(SCHEDULE_SHEET, schedXml);
  }

  // 3-c) 진행현황 시트 기준일(A10:C10 병합셀)·계획수량(A6:B6 병합셀) 갱신
  //  - A10: 다운로드 시점 업무일
  //  - A6: 다운로드 전 입력한 계획수량 (D6 달성률 = C6/A6 가 자동 연동)
  const needAsOf = typeof asOfSerial === "number" && isFinite(asOfSerial);
  const needPlan = typeof plannedQty === "number" && isFinite(plannedQty);
  if (needAsOf || needPlan) {
    const pFile = zip.file(PROGRESS_SHEET);
    if (pFile) {
      let pXml = await pFile.async("string");
      if (needAsOf) {
        pXml = pXml.replace(
          /(<c r="A10"[^>]*>)<v>[\d.]+<\/v>(<\/c>)/,
          (_m, pre: string, post: string) => `${pre}<v>${asOfSerial}</v>${post}`,
        );
      }
      if (needPlan) {
        pXml = pXml.replace(
          /(<c r="A6"[^>]*>)<v>[\d.]+<\/v>(<\/c>)/,
          (_m, pre: string, post: string) => `${pre}<v>${plannedQty}</v>${post}`,
        );
      }
      zip.file(PROGRESS_SHEET, pXml);
    }
  }

  // 4) workbook.xml: 열 때 전 시트 재계산
  let wbXml = await wbFile.async("string");
  if (/<calcPr\b/.test(wbXml)) {
    wbXml = wbXml.replace(/<calcPr\b([^>]*?)\/>/, (m, a: string) =>
      /fullCalcOnLoad=/.test(a)
        ? m.replace(/fullCalcOnLoad="[^"]*"/, 'fullCalcOnLoad="1"')
        : `<calcPr${a} fullCalcOnLoad="1"/>`,
    );
  } else {
    wbXml = wbXml.replace(/<\/workbook>/, '<calcPr fullCalcOnLoad="1"/></workbook>');
  }
  zip.file(WORKBOOK, wbXml);

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer, filled, added: added.length };
}
