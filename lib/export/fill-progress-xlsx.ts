// 진행현황 양식(.xlsx) 외과적 채움 — ExcelJS로 다시 쓰지 않고 zip 안의
// "차량리스트" 시트(sheet4.xml) G/H 셀만 직접 수정한다.
// → 피벗(Sheet1/Sheet11)·차트·다른 시트의 함수가 100% 그대로 보존된다.
//
// 동작 원리: 양식의 집계 시트(진행현황/전개일정)는 전부 COUNTIFS로
// 차량리스트 G("완료")·H(완료일)만 보고 자동 계산된다. 따라서 G/H만 채우고
// workbook의 fullCalcOnLoad를 켜면 Excel이 열릴 때 전 시트를 재계산한다.

import JSZip from "jszip";

const SHEET_PATH = "xl/worksheets/sheet4.xml"; // "차량리스트" (sheetId 4, 확인됨)

// XML 텍스트 언이스케이프 (sharedStrings <t> 복원용)
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// sharedStrings.xml → 문자열 배열. 각 <si>는 여러 <t>(리치텍스트 run) 가능 → 이어붙임.
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = "";
    for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) {
      text += unescapeXml(t[1]);
    }
    out.push(text);
  }
  return out;
}

interface FillResult {
  buffer: Buffer;
  filled: number; // 실제로 G/H가 채워진 차량 수
  missing: number; // 완료맵에 있으나 차량리스트에서 행/셀을 못 찾은 수
}

/**
 * 템플릿 버퍼 + 완료맵(plate → 완료일 Excel 직렬값)을 받아
 * 차량리스트 G="완료", H=완료일 직렬값을 채운 새 xlsx 버퍼를 반환.
 */
export async function fillProgressXlsx(
  templateBuffer: Buffer,
  completed: Map<string, number>,
): Promise<FillResult> {
  const zip = await JSZip.loadAsync(templateBuffer);

  const sheetFile = zip.file(SHEET_PATH);
  const ssFile = zip.file("xl/sharedStrings.xml");
  const wbFile = zip.file("xl/workbook.xml");
  if (!sheetFile || !ssFile || !wbFile) {
    throw new Error("양식 구조가 예상과 다릅니다 (sheet4/sharedStrings/workbook 누락).");
  }

  const shared = parseSharedStrings(await ssFile.async("string"));
  let sheetXml = await sheetFile.async("string");

  // 1) F 셀(차량번호)을 훑어 완료 대상 행 → 직렬값 맵 구성
  const rowSerial = new Map<number, number>();
  const matchedPlates = new Set<string>();
  // <c r="F123" ...> 형태. t="s"면 공유문자열, 아니면 인라인 <t> 또는 <v>
  for (const m of sheetXml.matchAll(/<c r="F(\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
    const row = Number(m[1]);
    const attrs = m[2];
    const inner = m[3];
    let plate = "";
    if (/t="s"/.test(attrs)) {
      const vi = inner.match(/<v>(\d+)<\/v>/);
      if (vi) plate = shared[Number(vi[1])] ?? "";
    } else if (/t="(inlineStr|str)"/.test(attrs)) {
      const ti = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      if (ti) plate = unescapeXml(ti[1]);
    } else {
      const vi = inner.match(/<v>([\s\S]*?)<\/v>/);
      if (vi) plate = vi[1];
    }
    plate = plate.trim();
    if (plate && completed.has(plate)) {
      rowSerial.set(row, completed.get(plate)!);
      matchedPlates.add(plate);
    }
  }

  // 2) 대상 행의 G/H 셀을 단일 패스로 교체 (빈 셀 <c .../> 또는 내용 있는 셀 모두 처리)
  let filled = 0;
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
      // col === "H": 날짜 직렬값(숫자). 기존 스타일(날짜 표시) 유지.
      return `<c r="H${row}"${s}><v>${rowSerial.get(row)}</v></c>`;
    },
  );
  filled = seenG.size;

  // 3) workbook.xml: 열 때 전 시트 재계산하도록 fullCalcOnLoad="1"
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

  zip.file(SHEET_PATH, sheetXml);
  zip.file("xl/workbook.xml", wbXml);

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return { buffer, filled, missing: completed.size - matchedPlates.size };
}
