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

// 셀 하나(<c r="REF" …/> 또는 …>…</c>)를 스타일(s=…)만 유지한 채 inlineStr 텍스트로 교체.
// (공유문자열 인덱스 변경 없이 해당 셀 표시값만 바꾸므로 다른 셀에 영향 없음.)
function replaceCellText(xml: string, ref: string, text: string): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  return xml.replace(re, (_m, attrs: string) => {
    const s = (attrs.match(/\bs="(\d+)"/) || [])[1];
    const sAttr = s ? ` s="${s}"` : "";
    return `<c r="${ref}"${sAttr} t="inlineStr"><is><t>${escapeXml(text)}</t></is></c>`;
  });
}

// 숫자 값을 가진 셀의 <v> 만 교체 (스타일·서식 유지).
function replaceCellNumber(xml: string, ref: string, val: number): string {
  return xml.replace(
    new RegExp(`(<c r="${ref}"[^>]*>)<v>[\\d.]+</v>(</c>)`),
    (_m, pre: string, post: string) => `${pre}<v>${val}</v>${post}`,
  );
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

export interface VehicleDbInfo {
  operator: string; // 운수사 (차량리스트 B열)
  route: string; // 노선 (차량리스트 C열)
  serial: number | null; // 설치 예정일 Excel 직렬값 (I열, null=미정)
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
 * - dbInfo(plate → {운수사,노선,예정일})를 주면 차량리스트 B/C/I열을 DB 값으로 덮어쓴다
 *   — 일정변경·노선변경 업로드가 다운로드 파일에도 반영되도록. (템플릿 값은 구버전)
 */
export async function fillProgressXlsx(
  templateBuffer: Buffer,
  completed: Map<string, CompletedInfo>,
  asOfSerial?: number, // 진행현황 시트 기준일(A3:E3 · A10:C10) — 선택한 업무일
  dailyPlan?: number, // 금일 계획수량(A6:B6 병합) — 기준일 당일 설치예정 대수
  cumPlan?: number, // 누적 계획수량(F6) — 기준일까지 설치예정 누적 대수
  dbInfo?: Map<string, VehicleDbInfo>, // 차량별 DB 최신값 (운수사·노선·설치 예정일)
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

  // 1) F 셀(차량번호) 스캔 → 행→차량번호 맵 + 완료 차량의 행→완료일 직렬값
  const rowSerial = new Map<number, number>();
  const rowPlate = new Map<number, string>();
  const matchedPlates = new Set<string>();
  for (const m of sheetXml.matchAll(/<c r="F(\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
    const row = Number(m[1]);
    const plate = cellValue(m[2], m[3], shared).trim();
    if (!plate) continue;
    rowPlate.set(row, plate);
    if (completed.has(plate)) {
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

  // 2-b) 차량리스트 B(운수사)/C(노선)/I(설치 예정일)열을 DB 최신값으로 갱신 —
  //      일정변경·노선변경 업로드가 다운로드에 반영되도록.
  //      셀이 있으면 값 교체(스타일 유지), I열은 없으면 열 순서에 맞춰 삽입, 미정이면 비움.
  if (dbInfo && dbInfo.size > 0) {
    const defaultIStyle = (sheetXml.match(/<c r="I\d+" s="(\d+)"/) || [])[1];
    sheetXml = sheetXml.replace(
      /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g,
      (whole, rowStr: string, inner: string) => {
        const row = Number(rowStr);
        const plate = rowPlate.get(row);
        const info = plate ? dbInfo.get(plate) : undefined;
        if (!info) return whole;
        let newInner = inner;

        // B(운수사)·C(노선) 텍스트 교체
        for (const [col, text] of [["B", info.operator], ["C", info.route]] as const) {
          if (!text) continue;
          const re = new RegExp(`<c r="${col}${row}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
          newInner = newInner.replace(re, (_m, attrs: string) => {
            const s = (attrs.match(/\bs="(\d+)"/) || [])[1];
            return `<c r="${col}${row}"${s ? ` s="${s}"` : ""} t="inlineStr"><is><t>${escapeXml(text)}</t></is></c>`;
          });
        }

        // I(설치 예정일) 숫자 교체/삽입/비움
        const serial = info.serial;
        const iRe = new RegExp(`<c r="I${row}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
        const m = newInner.match(iRe);
        if (m) {
          const s = (m[1].match(/\bs="(\d+)"/) || [])[1];
          const sAttr = s ? ` s="${s}"` : "";
          newInner = newInner.replace(
            iRe,
            serial == null ? `<c r="I${row}"${sAttr}/>` : `<c r="I${row}"${sAttr}><v>${serial}</v></c>`,
          );
        } else if (serial != null) {
          const sAttr = defaultIStyle ? ` s="${defaultIStyle}"` : "";
          const cell = `<c r="I${row}"${sAttr}><v>${serial}</v></c>`;
          // 셀은 열 순서대로 있어야 함: I보다 뒤 열의 첫 셀 앞에 삽입, 없으면 행 끝에 추가
          let insertAt = -1;
          for (const cm of newInner.matchAll(/<c r="([A-Z]+)\d+"/g)) {
            const col = cm[1];
            if (col.length > 1 || col > "I") {
              insertAt = cm.index!;
              break;
            }
          }
          newInner = insertAt >= 0 ? newInner.slice(0, insertAt) + cell + newInner.slice(insertAt) : newInner + cell;
        }

        return newInner === inner ? whole : whole.replace(inner, () => newInner);
      },
    );
  }

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

  // 3-c) 진행현황 시트 값·라벨·병합 보정
  //  - A3(A3:E3)·A10(A10:C10): 기준일(선택 업무일) — 두 날짜를 동일하게 맞춘다.
  //  - A6(A6:B6): 금일 계획수량 (기준일 당일 설치예정 대수, D6 달성률 = C6/A6 연동)
  //  - F6: 누적 계획수량 (기준일까지 설치예정 누적 대수, H6 달성률 = G6/F6 연동)
  //  - F11 헤더 라벨: "완료수량" → "누적 완료수량"
  //  - B11:C11 병합 해제 → B11="영업소"(유지), C11="노선"
  {
    const pFile = zip.file(PROGRESS_SHEET);
    if (pFile) {
      let pXml = await pFile.async("string");

      if (typeof asOfSerial === "number" && isFinite(asOfSerial)) {
        pXml = replaceCellNumber(pXml, "A10", asOfSerial);
        pXml = replaceCellNumber(pXml, "A3", asOfSerial); // A3 날짜 = A10 날짜
      }
      if (typeof dailyPlan === "number" && isFinite(dailyPlan)) {
        pXml = replaceCellNumber(pXml, "A6", dailyPlan);
      }
      if (typeof cumPlan === "number" && isFinite(cumPlan)) {
        pXml = replaceCellNumber(pXml, "F6", cumPlan);
      }

      // 헤더 라벨 변경 (스타일 유지)
      pXml = replaceCellText(pXml, "F11", "누적 완료수량");
      // 영업소/노선 헤더 분리: 병합 해제 후 C11 채움 (B11 "영업소"는 그대로)
      pXml = replaceCellText(pXml, "C11", "노선");
      if (pXml.includes('<mergeCell ref="B11:C11"/>')) {
        pXml = pXml.replace('<mergeCell ref="B11:C11"/>', "");
        pXml = pXml.replace(
          /(<mergeCells count=")(\d+)(")/,
          (_m, pre: string, n: string, post: string) => `${pre}${Number(n) - 1}${post}`,
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
