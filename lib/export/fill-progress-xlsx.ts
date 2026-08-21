// 진행현황 양식(.xlsx) 외과적 채움 — ExcelJS로 다시 쓰지 않고 zip 안의
// 시트 XML을 직접 수정한다. → 피벗(Sheet1/Sheet11)·차트·다른 시트의 함수가 100% 보존된다.
//
// 동작 원리: 집계 시트(진행현황/전개일정)는 전부 COUNTIFS로 차량리스트 G("완료")·H(완료일)만
// 보고 자동 계산된다. 따라서 G/H만 채우고 workbook의 fullCalcOnLoad를 켜면 Excel이 열릴 때
// 전 시트를 재계산한다.
//
// 차량 수 정합(총대수 = DB와 일치):
//   ① 템플릿 차량리스트에 없는 DB 차량(신규 증차·미완료 포함)은 행을 추가하고,
//      DB에서 삭제된 차량의 템플릿 행은 제거한다.
//   ② 전개일정의 (운수사|노선) 행별 대상수량(C열·정적 E열)을 "실제 대수 − 템플릿 대수"
//      델타만큼 보정한다 → 신규·삭제·노선이동이 모두 반영된다.
//      (진행현황 총대수 I6 = D합계 = 전개일정 E열 합이므로 자동 연동.)
//   ③ 전개일정 행을 정확히 못 찾으면 노선 정규화("번" 접미사 등)·운수사 단일행으로 매칭하고,
//      그렇게 잡힌 행은 노선 라벨을 DB 값으로 바꿔 완료 COUNTIFS도 맞게 한다.

import JSZip from "jszip";

const WORKBOOK = "xl/workbook.xml";

// 시트 물리 파일명(sheetN.xml)은 엑셀에서 재저장하면 시트 순서대로 바뀌므로
// workbook.xml + rels에서 시트 "이름"으로 경로를 해석한다. 실패 시 구 템플릿 고정 경로.
const FALLBACK_PATHS = {
  vehicle: "xl/worksheets/sheet4.xml", // 차량리스트
  schedule: "xl/worksheets/sheet3.xml", // 전개일정
  progress: "xl/worksheets/sheet2.xml", // 인천버스 B800단말기 설치 진행현황
};

async function resolveSheetPaths(zip: JSZip): Promise<typeof FALLBACK_PATHS> {
  const out = { ...FALLBACK_PATHS };
  const wbFile = zip.file(WORKBOOK);
  const relsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!wbFile || !relsFile) return out;
  const wb = await wbFile.async("string");
  const rels = await relsFile.async("string");

  const ridToPath = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/ Id="([^"]+)"/)?.[1];
    const target = m[0].match(/ Target="([^"]+)"/)?.[1];
    if (!id || !target) continue;
    if (/^worksheets\/sheet\d+\.xml$/.test(target)) ridToPath.set(id, "xl/" + target);
  }
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = m[0].match(/ name="([^"]+)"/)?.[1];
    const rid = m[0].match(/ r:id="([^"]+)"/)?.[1];
    if (!name || !rid) continue;
    const path = ridToPath.get(rid);
    if (!path) continue;
    const n = unescapeXml(name);
    if (n === "차량리스트") out.vehicle = path;
    else if (n === "전개일정") out.schedule = path;
    else if (n.includes("진행현황")) out.progress = path;
  }
  return out;
}

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

// 숫자 값 셀 세팅 (스타일 유지) — 빈 셀(<c/>)이어도 값을 넣는다. 수식 셀은 재계산에 맡기고 건너뜀.
function setCellNumber(xml: string, ref: string, val: number): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);
  return xml.replace(re, (m, attrs: string, inner?: string) => {
    if (inner && /<f[ >]/.test(inner)) return m;
    const s = (attrs.match(/\bs="(\d+)"/) || [])[1];
    return `<c r="${ref}"${s ? ` s="${s}"` : ""}><v>${val}</v></c>`;
  });
}

// 셀 값만 비우고 스타일은 유지 (설치제외 사유를 지울 때)
function clearCellText(xml: string, ref: string): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  return xml.replace(re, (_m, attrs: string) => {
    const s = (attrs.match(/\bs="(\d+)"/) || [])[1];
    return `<c r="${ref}"${s ? ` s="${s}"` : ""}/>`;
  });
}

// styles.xml 도우미 — "채움색만 바꾼 셀 스타일(xf)"을 만들어 준다.
// 글꼴·테두리·서식은 그대로 두고 fillId만 갈아끼운 xf를 복제해 새 인덱스를 돌려주므로,
// 어느 열에 적용해도 원래 서식이 유지된다. 색은 템플릿에 이미 있는 채움을 재사용한다.
function makeRestyler(stylesXml: string) {
  const xfsM = stylesXml.match(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/);
  const fillsM = stylesXml.match(/<fills count="\d+">([\s\S]*?)<\/fills>/);
  if (!xfsM || !fillsM) return null;
  // xf는 자식(<alignment/>)이 있을 수 있어 "빈 태그" 또는 "여는~닫는 태그"를 각각 잡는다
  const xfs = xfsM[1].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g);
  const fills = fillsM[1].match(/<fill>[\s\S]*?<\/fill>/g);
  if (!xfs || !fills) return null;

  // 템플릿에 있는 채움 찾기(없으면 같은 색으로 새로 추가) — theme 9=녹색, theme 7=베이지
  const fillFor = (theme: number): number => {
    const found = fills.findIndex((f) =>
      new RegExp(`<fgColor theme="${theme}" tint="0\\.79`).test(f),
    );
    if (found >= 0) return found;
    fills.push(
      `<fill><patternFill patternType="solid"><fgColor theme="${theme}" tint="0.79979857783745845"/><bgColor indexed="64"/></patternFill></fill>`,
    );
    return fills.length - 1;
  };
  const cache = new Map<string, number>();
  const restyle = (styleIdx: number, fillId: number): number => {
    const base = xfs[styleIdx];
    if (!base) return styleIdx;
    if (new RegExp(`fillId="${fillId}"`).test(base)) return styleIdx;
    const key = `${styleIdx}|${fillId}`;
    const hit = cache.get(key);
    if (hit != null) return hit;
    let xf = base.replace(/fillId="\d+"/, `fillId="${fillId}"`);
    if (!/fillId="/.test(xf)) return styleIdx; // 예상 밖 구조 — 원본 유지
    if (!/applyFill="1"/.test(xf)) xf = xf.replace(/<xf /, '<xf applyFill="1" ');
    xfs.push(xf);
    const idx = xfs.length - 1;
    cache.set(key, idx);
    return idx;
  };
  const serialize = () =>
    stylesXml
      .replace(
        /<fills count="\d+">[\s\S]*?<\/fills>/,
        `<fills count="${fills.length}">${fills.join("")}</fills>`,
      )
      .replace(
        /<cellXfs count="\d+">[\s\S]*?<\/cellXfs>/,
        `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>`,
      );
  return { green: fillFor(9), beige: fillFor(7), restyle, serialize };
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

// 배차표에서 '설치제외' 체크된 차량 — 진행현황 시트 행 색칠·비고(I:N)용.
export interface ExclusionInfo {
  plate: string;
  operator: string; // 진행현황 B열(영업소) 매칭용
  route: string; // 진행현황 C열(노선) 매칭용
  reason: string; // 금일완료 리포트에서 적은 제외 사유(빈 값이면 비고를 안 적는다)
}

export interface VehicleDbInfo {
  operator: string; // 운수사 (차량리스트 B열)
  route: string; // 노선 (차량리스트 C열)
  serial: number | null; // 설치 예정일 Excel 직렬값 (I열, null=미정)
  listNo: number | null; // 번호 (A열, null=미적재 → 템플릿 값 유지)
}

// 차량리스트 데이터 행(2행~)을 번호(list_no)→설치예정일→원순서로 재정렬하고,
// keepPlate가 false인 차량(DB에서 삭제된 차량) 행은 제거한다.
// 시트에 수식·병합이 없는 순수 값 행이라 행 블록을 통째로 옮기고 셀 참조만 갈아끼운다.
// 구조가 예상과 다르면(블록 재조립 불일치 등) 원본을 그대로 반환해 안전하게 건너뛴다.
function sortVehicleRows(
  xml: string,
  dbInfo: Map<string, VehicleDbInfo>,
  shared: string[],
  keepPlate: (plate: string) => boolean,
): { xml: string; removed: number } {
  const open = xml.indexOf("<sheetData>");
  const close = xml.indexOf("</sheetData>");
  if (open < 0 || close < 0) return { xml, removed: 0 };
  const bodyStart = open + "<sheetData>".length;
  const body = xml.slice(bodyStart, close);

  const blocks = body.match(/<row r="\d+"[^>]*(?:\/>|>[\s\S]*?<\/row>)/g);
  if (!blocks || blocks.length < 3) return { xml, removed: 0 };
  // 행 사이 공백/개행은 무시하고 비교 — 공백만으로 정렬(삭제 차량 제거 포함)이 통째로
  // 건너뛰어지면 전개일정 대상수량 델타와 어긋나 총대수 불일치가 생긴다.
  const normalized = body
    .replace(/(<\/row>|\/>)\s+(?=<row )/g, "$1")
    .replace(/^\s+/, "")
    .replace(/\s+$/, "");
  if (blocks.join("") !== normalized) return { xml, removed: 0 }; // 행 사이에 예상 밖 내용 → 정렬 포기
  if (!blocks[0].startsWith('<row r="1"')) return { xml, removed: 0 }; // 1행=헤더 전제

  const keyed = blocks.slice(1).map((block, idx) => {
    const f = block.match(/<c r="F\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/);
    const plate = f ? cellValue(f[1], f[2] ?? "", shared).trim() : "";
    const info = plate ? dbInfo.get(plate) : undefined;
    return {
      block,
      idx,
      plate,
      no: info?.listNo ?? Number.MAX_SAFE_INTEGER,
      date: info?.serial ?? Number.MAX_SAFE_INTEGER,
    };
  });
  const kept = keyed.filter((k) => !k.plate || keepPlate(k.plate));
  const removed = keyed.length - kept.length;
  kept.sort((a, b) => a.no - b.no || a.date - b.date || a.idx - b.idx);

  let out = blocks[0];
  let rn = 1;
  for (const k of kept) {
    rn++;
    out +=
      k.block
        .replace(/^<row r="\d+"/, `<row r="${rn}"`)
        .replace(/<c r="([A-Z]{1,2})\d+"/g, (_m, col: string) => `<c r="${col}${rn}"`);
  }
  return { xml: xml.slice(0, bodyStart) + out + xml.slice(close), removed };
}

// 같은 사유는 한 줄로 묶는다 — "4507, 4781 선폐차로 추후 설치 예정" 모양.
// 차량번호는 사용자가 쓰던 대로 뒤 4자리만.
function formatExclusionNote(list: { plate: string; reason: string }[]): string {
  const byReason = new Map<string, string[]>();
  for (const e of list) {
    const reason = e.reason.trim();
    if (!reason) continue;
    const short = (e.plate.match(/(\d{4})\s*$/) || [])[1] ?? e.plate;
    byReason.set(reason, [...(byReason.get(reason) ?? []), short]);
  }
  return [...byReason]
    .map(([reason, plates]) => `${plates.join(", ")} ${reason}`)
    .join(" / ");
}

// 진행현황 시트 데이터 행(11행 헤더 아래)을 훑어 색칠·비고를 적용한다.
// 누적완료는 시트 수식(전개일정 F)과 같은 방식으로 계산: (운수사|노선) 완료 대수를
// 같은 조합의 행들에 위에서부터 대상대수만큼 채워 나눈다(시범설치 행 → 본설치 행).
function paintProgressRows(opts: {
  pXml: string;
  shared: string[];
  completed: Map<string, CompletedInfo>;
  dbInfo?: Map<string, VehicleDbInfo>;
  exclusions: ExclusionInfo[];
  schedAdjust: Map<number, number>;
  restyler: NonNullable<ReturnType<typeof makeRestyler>>;
}): { pXml: string; changed: boolean } {
  const { shared, completed, dbInfo, exclusions, schedAdjust, restyler } = opts;

  // (운수사|||노선)별 누적 완료 대수 — 차량리스트 B/C와 같은 값으로 센다
  const doneByGroup = new Map<string, number>();
  for (const [plate, info] of completed) {
    const db = dbInfo?.get(plate);
    const key = `${(db?.operator ?? info.operator).trim()}|||${(db?.route ?? info.route).trim()}`;
    doneByGroup.set(key, (doneByGroup.get(key) ?? 0) + 1);
  }

  // 설치제외 이력: 그룹별 (아직 미완료인) 제외 차량 + 제외 차량번호 뒤 4자리 목록
  const exclByGroup = new Map<string, { plate: string; reason: string }[]>();
  const exclTails = new Map<string, string[]>();
  for (const e of exclusions) {
    const db = dbInfo?.get(e.plate);
    const key = `${(db?.operator ?? e.operator).trim()}|||${(db?.route ?? e.route).trim()}`;
    const tail = (e.plate.match(/(\d{4})\s*$/) || [])[1];
    if (tail) exclTails.set(key, [...(exclTails.get(key) ?? []), tail]);
    if (completed.has(e.plate)) continue; // 나중에 설치된 차량은 사유에서 뺀다
    exclByGroup.set(key, [...(exclByGroup.get(key) ?? []), { plate: e.plate, reason: e.reason }]);
  }

  // 1) 데이터 행 스캔 (영업소·노선·대상대수·비고)
  const rowRe = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  const rows: { row: number; key: string; target: number; note: string }[] = [];
  for (const m of opts.pXml.matchAll(rowRe)) {
    const row = Number(m[1]);
    if (row <= 11) continue; // 11행까지는 머리말
    const cells = new Map<string, { attrs: string; inner: string }>();
    for (const cm of m[2].matchAll(cellRe)) {
      cells.set(cm[1], { attrs: cm[2], inner: cm[3] ?? "" });
    }
    const b = cells.get("B");
    const c = cells.get("C");
    const d = cells.get("D");
    if (!b || !c || !d) continue;
    const op = cellValue(b.attrs, b.inner, shared).trim();
    const rt = cellValue(c.attrs, c.inner, shared).trim();
    if (!op || !rt) continue;
    // 대상대수: 값 셀이면 그 값, 전개일정 E를 참조하는 수식이면 캐시값 + 이번 보정(Δ)
    let target = Number((d.inner.match(/<v>([\d.]+)<\/v>/) || [])[1]);
    const sched = d.inner.match(/'?전개일정'?!\$?E\$?(\d+)/);
    if (sched) target += schedAdjust.get(Number(sched[1])) ?? 0;
    if (!Number.isFinite(target)) continue;
    const i = cells.get("I");
    rows.push({
      row,
      key: `${op}|||${rt}`,
      target,
      note: i ? cellValue(i.attrs, i.inner, shared).trim() : "",
    });
  }
  if (rows.length === 0) return { pXml: opts.pXml, changed: false };

  // 2) 행별 판정 — 제외 차량은 같은 조합의 마지막 행(=아직 설치 중인 행)에 붙인다
  const lastRowOfKey = new Map<string, number>();
  for (const r of rows) lastRowOfKey.set(r.key, r.row);
  const remain = new Map(doneByGroup);
  const actions = new Map<number, { fillId: number; note?: string | null }>();
  for (const r of rows) {
    const rem = remain.get(r.key) ?? 0;
    const done = Math.max(0, Math.min(r.target, rem));
    remain.set(r.key, rem - done);
    if (r.target <= 0) continue;
    const isLast = lastRowOfKey.get(r.key) === r.row;
    const excl = isLast ? exclByGroup.get(r.key) ?? [] : [];
    // 제외 차량번호가 적힌 비고만 '제외 사유'로 본다 — '시범설치' 같은 다른 메모는 남긴다
    const isExclNote =
      isLast && !!r.note && (exclTails.get(r.key) ?? []).some((t) => r.note.includes(t));
    if (done >= r.target) {
      // 대상 = 누적완료 → 녹색. 제외 사유가 적혀 있던 자리는 비운다.
      actions.set(r.row, { fillId: restyler.green, note: isExclNote ? null : undefined });
    } else if (done > 0 || excl.length > 0) {
      // 부족(설치제외 등) → 베이지. 비고가 비어 있을 때만 사유를 적는다.
      const note = r.note ? "" : formatExclusionNote(excl);
      actions.set(r.row, { fillId: restyler.beige, note: note || undefined });
    }
  }
  if (actions.size === 0) return { pXml: opts.pXml, changed: false };

  // 3) 적용 — A~N 셀의 스타일을 "채움만 바꾼" 스타일로 교체
  const pXml = opts.pXml.replace(rowRe, (whole, rowStr: string, inner: string) => {
    const act = actions.get(Number(rowStr));
    if (!act) return whole;
    const row = Number(rowStr);
    let newInner = inner.replace(
      /<c r="([A-N])\d+"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g,
      (cellWhole: string, _col: string, attrs: string) => {
        const s = Number((attrs.match(/\bs="(\d+)"/) || [])[1]);
        if (!Number.isFinite(s)) return cellWhole;
        const ns = restyler.restyle(s, act.fillId);
        return ns === s ? cellWhole : cellWhole.replace(/\bs="\d+"/, `s="${ns}"`);
      },
    );
    if (act.note === null) newInner = clearCellText(newInner, `I${row}`);
    else if (act.note) newInner = replaceCellText(newInner, `I${row}`, act.note);
    return whole.replace(inner, () => newInner);
  });
  return { pXml, changed: true };
}

interface FillResult {
  buffer: Buffer;
  filled: number; // 차량리스트 기존 행에 G/H 채운 수
  added: number; // 템플릿에 없어 새 행으로 추가한 수(신규·증차)
  removed: number; // DB에서 삭제돼 템플릿에서 뺀 행 수
}

/**
 * 템플릿 버퍼 + 완료맵(plate → {직렬값,운수사,노선})을 받아 채운 새 xlsx 버퍼를 반환.
 * - 차량리스트에 있는 차량: G="완료", H=완료일.
 * - 템플릿에 없는 차량(신규·증차, 미완료 포함): 행 추가. DB에서 삭제된 차량: 행 제거.
 * - 전개일정 대상수량은 (운수사|노선) 그룹별 "실제 대수 − 템플릿 대수" 델타로 보정.
 * - dbInfo(plate → {번호,운수사,노선,예정일})를 주면 차량리스트 A/B/C/I열을 DB 값으로
 *   덮어쓴다 — 일정변경·노선변경 업로드가 다운로드 파일에도 반영되도록. (템플릿 값은 구버전)
 */
export async function fillProgressXlsx(
  templateBuffer: Buffer,
  completed: Map<string, CompletedInfo>,
  asOfSerial?: number, // 진행현황 시트 기준일(A3:E3 · A10:C10) — 선택한 업무일
  dailyPlan?: number, // 금일 계획수량(A6:B6 병합) — 기준일 당일 설치예정 대수
  cumPlan?: number, // 누적 계획수량(F6) — 기준일까지 설치예정 누적 대수
  dbInfo?: Map<string, VehicleDbInfo>, // 차량별 DB 최신값 (운수사·노선·설치 예정일)
  exclusions?: ExclusionInfo[], // 배차표 설치제외 이력 (기준일까지)
): Promise<FillResult> {
  const zip = await JSZip.loadAsync(templateBuffer);

  const sheetPaths = await resolveSheetPaths(zip);
  const vFile = zip.file(sheetPaths.vehicle);
  const sFile = zip.file(sheetPaths.schedule);
  const ssFile = zip.file("xl/sharedStrings.xml");
  const wbFile = zip.file(WORKBOOK);
  if (!vFile || !ssFile || !wbFile) {
    throw new Error("양식 구조가 예상과 다릅니다 (차량리스트/sharedStrings/workbook 누락).");
  }

  const shared = parseSharedStrings(await ssFile.async("string"));
  let sheetXml = await vFile.async("string");

  // 1) 차량리스트 행 스캔 → 행→차량번호 맵 + 완료 차량의 행→완료일 직렬값
  //    + 템플릿 원본 (운수사|노선) 그룹별 대수 — 전개일정 대상수량 델타 보정(3-b)의 기준.
  //    (B/C가 DB 값으로 덮어써지기 전에 읽어야 노선이동 델타가 정확하다)
  const rowSerial = new Map<number, number>();
  const rowPlate = new Map<number, string>();
  const matchedPlates = new Set<string>();
  const tplGroupCount = new Map<string, number>();
  for (const rowM of sheetXml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = Number(rowM[1]);
    if (row < 2) continue; // 1행=헤더
    let plate = "";
    let op = "";
    let rt = "";
    for (const cm of rowM[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if (cm[1] === "F") plate = cellValue(cm[2], cm[3] ?? "", shared).trim();
      else if (cm[1] === "B") op = cellValue(cm[2], cm[3] ?? "", shared).trim();
      else if (cm[1] === "C") rt = cellValue(cm[2], cm[3] ?? "", shared).trim();
    }
    if (!plate) continue;
    rowPlate.set(row, plate);
    const key = `${op}|||${rt}`;
    tplGroupCount.set(key, (tplGroupCount.get(key) ?? 0) + 1);
    if (completed.has(plate)) {
      rowSerial.set(row, completed.get(plate)!.serial);
      matchedPlates.add(plate);
    }
  }

  // 2) 기존 행 G/H 채움. 완료가 아닌 차량 행은 비운다 —
  //    템플릿(사용자 편집본)에 박혀 있던 완료 표기가 기준일 스냅샷을 오염시키지 않도록.
  //    G/H 셀이 아예 없는 행(추가분이 템플릿이 된 뒤 엑셀 재저장으로 빈 셀이 사라진 경우)
  //    에는 셀을 삽입한다 — 안 그러면 그 차량은 완료돼도 영영 표기되지 않는다.
  const seenG = new Set<number>();
  const defaultStyleOf = (col: string) => (sheetXml.match(new RegExp(`<c r="${col}\\d+" s="(\\d+)"`)) || [])[1];
  const defaultGH = { G: defaultStyleOf("G"), H: defaultStyleOf("H") } as Record<string, string | undefined>;
  sheetXml = sheetXml.replace(
    /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g,
    (whole, rowStr: string, inner: string) => {
      const row = Number(rowStr);
      if (!rowPlate.has(row)) return whole; // 차량 행이 아니면(헤더 등) 그대로
      const serial = rowSerial.get(row);
      if (serial != null) seenG.add(row);
      let newInner = inner;
      for (const col of ["G", "H"] as const) {
        const re = new RegExp(`<c r="${col}${row}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
        const m = newInner.match(re);
        const s = m ? (m[1].match(/\bs="(\d+)"/) || [])[1] : defaultGH[col];
        const sAttr = s ? ` s="${s}"` : "";
        const cell =
          serial == null
            ? `<c r="${col}${row}"${sAttr}/>`
            : col === "G"
              ? `<c r="G${row}"${sAttr} t="inlineStr"><is><t>완료</t></is></c>`
              : `<c r="H${row}"${sAttr}><v>${serial}</v></c>`;
        if (m) {
          newInner = newInner.replace(re, cell);
        } else {
          // 셀은 열 순서대로: 이 열보다 뒤 열의 첫 셀 앞에 삽입, 없으면 행 끝에
          let insertAt = -1;
          for (const cm of newInner.matchAll(/<c r="([A-Z]+)\d+"/g)) {
            const c = cm[1];
            if (c.length > 1 || c > col) {
              insertAt = cm.index!;
              break;
            }
          }
          newInner =
            insertAt >= 0 ? newInner.slice(0, insertAt) + cell + newInner.slice(insertAt) : newInner + cell;
        }
      }
      return newInner === inner ? whole : whole.replace(inner, () => newInner);
    },
  );
  const filled = seenG.size;

  // 2-b) 차량리스트 A(번호)/B(운수사)/C(노선)/I(설치 예정일)열을 DB 최신값으로 갱신 —
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

        // A(번호) 숫자 교체 — DB에 번호가 적재된 차량만 (null이면 템플릿 값 유지)
        if (info.listNo != null) {
          const aRe = new RegExp(`<c r="A${row}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
          if (aRe.test(newInner)) {
            newInner = newInner.replace(aRe, (_m, attrs: string) => {
              const s = (attrs.match(/\bs="(\d+)"/) || [])[1];
              return `<c r="A${row}"${s ? ` s="${s}"` : ""}><v>${info.listNo}</v></c>`;
            });
          } else {
            newInner = `<c r="A${row}"><v>${info.listNo}</v></c>` + newInner; // A=첫 열이라 행 맨 앞 삽입
          }
        }

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

  // 3) 템플릿 차량리스트에 없는 차량 = 추가 대상.
  //    ① DB 차량 전체 중 템플릿에 없는 차량 — 미완료 신규분 포함(총대수가 DB와 맞도록)
  //    ② DB에는 없지만 완료 기록이 있는 차량(증차 완료분)
  const tplPlates = new Set(rowPlate.values());
  const added: {
    plate: string;
    operator: string;
    route: string;
    doneSerial: number | null;
    planSerial: number | null;
    listNo: number | null;
  }[] = [];
  if (dbInfo) {
    for (const [plate, info] of dbInfo) {
      if (tplPlates.has(plate)) continue;
      added.push({
        plate,
        operator: info.operator,
        route: info.route,
        doneSerial: completed.get(plate)?.serial ?? null,
        planSerial: info.serial,
        listNo: info.listNo,
      });
    }
  }
  for (const [plate, info] of completed) {
    if (tplPlates.has(plate) || dbInfo?.has(plate)) continue;
    added.push({
      plate,
      operator: info.operator,
      route: info.route,
      doneSerial: info.serial,
      planSerial: null,
      listNo: null,
    });
  }

  // 3-a) 차량리스트에 행 추가 — 완료차는 G/H, 미완료차는 I(예정일)까지 채운다
  if (added.length > 0) {
    // 셀 스타일은 기존 데이터 행(2행~)에서 열별로 가져온다
    // (스타일 인덱스는 템플릿을 엑셀에서 재저장할 때마다 바뀌므로 상수로 둘 수 없음)
    const dataStyle = (col: string): string | undefined => {
      for (const m of sheetXml.matchAll(new RegExp(`<c r="${col}(\\d+)" s="(\\d+)"`, "g"))) {
        if (Number(m[1]) >= 2) return m[2];
      }
      return undefined;
    };
    const st = (col: string): string => {
      const s = dataStyle(col);
      return s ? ` s="${s}"` : "";
    };
    const styles = {
      A: st("A"), B: st("B"), C: st("C"), F: st("F"), G: st("G"), H: st("H"), I: st("I"),
    };
    let maxRow = 0;
    for (const m of sheetXml.matchAll(/<row r="(\d+)"/g)) maxRow = Math.max(maxRow, Number(m[1]));
    let rowsXml = "";
    let rn = maxRow;
    for (const a of added) {
      rn++;
      rowsXml +=
        `<row r="${rn}" spans="1:37">` +
        (a.listNo != null ? `<c r="A${rn}"${styles.A}><v>${a.listNo}</v></c>` : "") +
        `<c r="B${rn}"${styles.B} t="inlineStr"><is><t>${escapeXml(a.operator)}</t></is></c>` +
        `<c r="C${rn}"${styles.C} t="inlineStr"><is><t>${escapeXml(a.route)}</t></is></c>` +
        `<c r="F${rn}"${styles.F} t="inlineStr"><is><t>${escapeXml(a.plate)}</t></is></c>` +
        (a.doneSerial != null
          ? `<c r="G${rn}"${styles.G} t="inlineStr"><is><t>완료</t></is></c>` +
            `<c r="H${rn}"${styles.H}><v>${a.doneSerial}</v></c>`
          : // 미완료라도 빈 G/H 셀(스타일 포함)을 넣어 둔다 — 이 파일이 템플릿이 된 뒤
            // 완료됐을 때 채울 자리를 남기기 위해(스타일 있는 빈 셀은 엑셀 재저장에도 유지)
            `<c r="G${rn}"${styles.G}/><c r="H${rn}"${styles.H}/>`) +
        (a.planSerial != null ? `<c r="I${rn}"${styles.I}><v>${a.planSerial}</v></c>` : "") +
        `</row>`;
    }
    sheetXml = sheetXml.replace("</sheetData>", rowsXml + "</sheetData>");
    sheetXml = sheetXml.replace(
      /<dimension ref="([A-Z]+)1:([A-Z]+)\d+"\/>/,
      (_m, a: string, b: string) => `<dimension ref="${a}1:${b}${rn}"/>`,
    );
  }

  // 3-a') 차량리스트 행 재정렬(번호→예정일 순) + DB에서 삭제된 차량 행 제거
  let removed = 0;
  if (dbInfo && dbInfo.size > 0) {
    const r = sortVehicleRows(sheetXml, dbInfo, shared, (p) => dbInfo.has(p) || completed.has(p));
    sheetXml = r.xml;
    removed = r.removed;
  }

  zip.file(sheetPaths.vehicle, sheetXml);

  // 3-b) 전개일정 대상수량 보정 — (운수사|노선) 그룹별 델타(실제 대수 − 템플릿 대수)를
  //      해당 행의 C열과 정적 E열에 더한다(E가 수식 "$C행"이면 재계산이 처리).
  //      진행현황 시트의 대상대수(D열)·총대수(I6)는 전개일정 E열을 참조하므로 자동 연동.
  const schedRelabels: { schedRow: number; label: string }[] = [];
  // 전개일정 행 → 대상수량 보정(Δ). 진행현황 D열이 이 행의 E를 참조하므로 색칠 판정에도 쓴다.
  const schedAdjust = new Map<number, number>();
  if (sFile) {
    // 실제 대수 = DB 차량 전체 + DB에 없는 완료 차량(증차 완료분)
    const realGroup = new Map<string, number>();
    const bump = (op: string, rt: string) => {
      const key = `${op}|||${rt}`;
      realGroup.set(key, (realGroup.get(key) ?? 0) + 1);
    };
    if (dbInfo) for (const info of dbInfo.values()) bump(info.operator, info.route);
    for (const [plate, info] of completed) {
      if (!dbInfo?.has(plate)) bump(info.operator, info.route);
    }

    // 델타. dbInfo(차량 전수)가 없으면 템플릿 대비 비교가 불가능하므로 증차 완료분만 +1(구 동작).
    const deltas = new Map<string, number>();
    if (dbInfo && dbInfo.size > 0) {
      for (const key of new Set([...realGroup.keys(), ...tplGroupCount.keys()])) {
        const d = (realGroup.get(key) ?? 0) - (tplGroupCount.get(key) ?? 0);
        if (d !== 0) deltas.set(key, d);
      }
    } else {
      for (const [plate, info] of completed) {
        if (matchedPlates.has(plate)) continue;
        const key = `${info.operator}|||${info.route}`;
        deltas.set(key, (deltas.get(key) ?? 0) + 1);
      }
    }

    if (deltas.size > 0) {
      let schedXml = await sFile.async("string");

      // 전개일정 데이터 행(5행~) 인덱싱: 정확 키 / 노선 정규화 키 / 운수사별
      const norm = (s: string) => s.replace(/\s+/g, "").replace(/번$/, "");
      const exactIdx = new Map<string, number[]>();
      const normIdx = new Map<string, number[]>();
      const opIdx = new Map<string, number[]>();
      for (const rm of schedXml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
        const rn = Number(rm[1]);
        if (rn < 5) continue;
        const aCell = rm[2].match(/<c r="A\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/);
        const bCell = rm[2].match(/<c r="B\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/);
        if (!aCell || !bCell) continue;
        const op = cellValue(aCell[1], aCell[2] ?? "", shared).trim();
        const rt = cellValue(bCell[1], bCell[2] ?? "", shared).trim();
        if (!op || op === "합계") continue;
        const push = (m: Map<string, number[]>, k: string) => m.set(k, [...(m.get(k) ?? []), rn]);
        push(exactIdx, `${op}|||${rt}`);
        push(normIdx, `${op}|||${norm(rt)}`);
        push(opIdx, op);
      }

      // 델타 → 행 배정. 같은 (운수사|노선)이 여러 행이면 마지막 행에 반영.
      const rowAdjust = schedAdjust;
      const rowLabel = new Map<number, string>();
      for (const [key, delta] of deltas) {
        const [op, rt] = key.split("|||");
        let rows = exactIdx.get(key);
        let renamed = false;
        if (!rows) {
          rows = normIdx.get(`${op}|||${norm(rt)}`);
          if (!rows && (opIdx.get(op)?.length ?? 0) === 1) rows = opIdx.get(op);
          renamed = !!rows;
        }
        if (!rows || rows.length === 0) {
          console.warn(`[fill-progress] 전개일정에 (${op} | ${rt}) 행이 없어 대상수량 Δ${delta} 미반영`);
          continue;
        }
        const rn = rows[rows.length - 1];
        rowAdjust.set(rn, (rowAdjust.get(rn) ?? 0) + delta);
        // 노선 라벨이 다른 행에 매칭됐으면 라벨을 실제(DB) 노선명으로 교정 —
        // 완료 COUNTIFS(차량리스트 B/C 대조)가 맞아떨어지도록.
        if (renamed) rowLabel.set(rn, rt);
      }

      schedXml = schedXml.replace(/<row r="(\d+)"[^>]*>[\s\S]*?<\/row>/g, (whole, rnStr: string) => {
        const rn = Number(rnStr);
        const adj = rowAdjust.get(rn) ?? 0;
        const label = rowLabel.get(rn);
        if (!adj && !label) return whole;
        let out = whole;
        if (adj) {
          for (const col of ["C", "E"] as const) {
            out = out.replace(
              new RegExp(`(<c r="${col}${rn}"[^>]*>)<v>(\\d+(?:\\.\\d+)?)</v>(</c>)`),
              (_m, pre: string, num: string, post: string) =>
                `${pre}<v>${Math.max(0, Number(num) + adj)}</v>${post}`,
            );
          }
        }
        if (label) {
          out = replaceCellText(out, `B${rn}`, label);
          schedRelabels.push({ schedRow: rn, label });
        }
        return out;
      });
      zip.file(sheetPaths.schedule, schedXml);
    }
  }

  // 3-c) 진행현황 시트 값·라벨·병합 보정
  //  - A3(A3:E3)·A10(A10:C10): 기준일(선택 업무일) — 두 날짜를 동일하게 맞춘다.
  //  - A6(A6:B6): 금일 계획수량 (기준일 당일 설치예정 대수, D6 달성률 = C6/A6 연동)
  //  - F6: 누적 계획수량 (기준일까지 설치예정 누적 대수, H6 달성률 = G6/F6 연동)
  //  - F11 헤더 라벨: "완료수량" → "누적 완료수량"
  //  - B11:C11 병합 해제 → B11="영업소"(유지), C11="노선"
  {
    const pFile = zip.file(sheetPaths.progress);
    if (pFile) {
      let pXml = await pFile.async("string");

      if (typeof asOfSerial === "number" && isFinite(asOfSerial)) {
        pXml = setCellNumber(pXml, "A10", asOfSerial);
        pXml = setCellNumber(pXml, "A3", asOfSerial); // A3 날짜 = A10 날짜
      }
      if (typeof dailyPlan === "number" && isFinite(dailyPlan)) {
        pXml = setCellNumber(pXml, "A6", dailyPlan);
      }
      if (typeof cumPlan === "number" && isFinite(cumPlan)) {
        pXml = setCellNumber(pXml, "F6", cumPlan);
      }

      // 헤더 라벨 변경 (스타일 유지)
      pXml = replaceCellText(pXml, "F11", "누적 완료수량");
      // 영업소/노선 헤더 분리: 병합 해제 후 C11 채움 (B11 "영업소"는 그대로)
      pXml = replaceCellText(pXml, "C11", "노선");

      // 전개일정에서 노선 라벨을 교정한 행 → 진행현황의 같은 행(D열이 그 행의 E를 참조) 노선도 동기화
      for (const { schedRow, label } of schedRelabels) {
        const dm = pXml.match(
          new RegExp(`<c r="D(\\d+)"[^>]*><f[^>]*>'?전개일정'?!\\$?E\\$?${schedRow}</f>`),
        );
        if (dm) pXml = replaceCellText(pXml, `C${dm[1]}`, label);
      }
      if (pXml.includes('<mergeCell ref="B11:C11"/>')) {
        pXml = pXml.replace('<mergeCell ref="B11:C11"/>', "");
        pXml = pXml.replace(
          /(<mergeCells count=")(\d+)(")/,
          (_m, pre: string, n: string, post: string) => `${pre}${Number(n) - 1}${post}`,
        );
      }

      // 3-d) 행 색칠 + 설치제외 사유(I:N) — 사용자가 손으로 칠하던 규칙 그대로.
      //   누적완료 ≥ 대상대수 → 녹색 / 대상에 못 미치면(설치제외 등) → 베이지.
      //   아직 한 대도 완료 안 된 행(제외도 없음)은 그대로 둔다.
      //   비고는 비어 있을 때만 제외 사유를 적고(기존 문구는 건드리지 않음),
      //   나중에 설치돼 누적=대상이 되면 그 자리를 비운다.
      const stylesFile = zip.file("xl/styles.xml");
      if (stylesFile) {
        const restyler = makeRestyler(await stylesFile.async("string"));
        if (restyler) {
          const painted = paintProgressRows({
            pXml,
            shared,
            completed,
            dbInfo,
            exclusions: exclusions ?? [],
            schedAdjust,
            restyler,
          });
          pXml = painted.pXml;
          if (painted.changed) zip.file("xl/styles.xml", restyler.serialize());
        }
      }

      zip.file(sheetPaths.progress, pXml);
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
  return { buffer, filled, added: added.length, removed };
}
