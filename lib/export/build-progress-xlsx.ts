// 진행현황 양식 채운 xlsx 버퍼 생성 — 다운로드 라우트와 리포트 메일 첨부가 공유.
// 완료(저장 + 설치 전·후 사진 전부 충족) 데이터를 읽어
// Supabase 비공개 버킷의 템플릿 차량리스트를 채운다.

import ExcelJS from "exceljs";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { fetchCompletedMap } from "@/lib/stats";
import {
  fillProgressXlsx,
  type CompletedInfo,
  type ExclusionInfo,
  type VehicleDbInfo,
} from "@/lib/export/fill-progress-xlsx";
import { buildV2Workbook } from "@/lib/export/v2-form";
import { VCOL, cellText, isExample, isTarget, readVehicleTable, type VehicleRow } from "@/lib/import/vehicle-columns";
import { workDateString, workDateExcelSerial, excelSerialFromDate } from "@/lib/work-day";

import { TEMPLATE_BUCKET, templateObject } from "@/lib/template-path";
import { currentSlug, getProject, isDefault } from "@/lib/project";
import { stdSlotKeys } from "@/lib/slots";
import { PROJECT_PERIOD_KEY, getSetting, getSlotConfig, parsePeriod } from "@/lib/settings";


// asOfDate: 기준일(업무일 "YYYY-MM-DD"). 지정 없으면 현재 업무일.
//  - 완료(차량리스트 G/H)는 기준일까지 완료된 것만 채움 → 그 날짜 시점 스냅샷.
//  - 계획수량은 차량 설치예정일(planned_date) 기준: 금일(A6)=당일, 누적(F6)=기준일까지.
export async function buildProgressXlsx(opts?: { asOfDate?: string; slug?: string }): Promise<{
  buffer: Buffer;
  filename: string;
  filled: number;
  added: number;
  removed: number;
}> {
  const slug = opts?.slug ?? currentSlug();
  const supabase = createServiceClient(slug);

  const asOfDate =
    opts?.asOfDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.asOfDate)
      ? opts.asOfDate
      : workDateString(new Date());

  // 완료(저장 + 슬롯 충족) 맵 + 차량 운수사/노선/예정일 전수 조회
  // — 완료 판정은 팀즈 카드·대시보드와 같은 fetchCompletedMap 기준(진행현황 일치).
  const [completedMap, vrows] = await Promise.all([
    fetchCompletedMap(supabase, stdSlotKeys(await getSlotConfig(slug))),
    // select("*"): list_no 컬럼이 아직 없는 DB(migration_list_no.sql 미실행)에서도 동작
    fetchAll<{
      plate: string;
      operator: string | null;
      route: string | null;
      planned_date: string | null;
      list_no?: number | null;
    }>((from, to) => supabase.from("vehicles").select("*").order("plate").range(from, to)),
  ]);

  const vmap = new Map(vrows.map((v) => [v.plate, v]));
  const completed = new Map<string, CompletedInfo>();
  for (const [plate, savedAt] of completedMap) {
    // 기준일까지 완료된 것만 (스냅샷) — 완료 업무일이 기준일 이후면 제외
    if (workDateString(savedAt) > asOfDate) continue;
    const v = vmap.get(plate);
    completed.set(plate, {
      serial: workDateExcelSerial(savedAt),
      operator: (v?.operator ?? "").trim(),
      route: (v?.route ?? "").trim(),
    });
  }

  // 계획수량 = 차량리스트 설치예정일(planned_date) 대수. 금일=당일, 누적=기준일까지.
  // dbInfo = 차량별 최신값 맵 → 다운로드 파일 차량리스트 B/C/I열을 DB 기준으로 갱신.
  let dailyPlan = 0;
  let cumPlan = 0;
  const dbInfo = new Map<string, VehicleDbInfo>();
  for (const v of vrows) {
    const pd = v.planned_date ? String(v.planned_date).slice(0, 10) : "";
    dbInfo.set(v.plate, {
      operator: (v.operator ?? "").trim(),
      route: (v.route ?? "").trim(),
      serial: pd ? excelSerialFromDate(pd) : null,
      listNo: v.list_no ?? null,
    });
    if (!pd) continue;
    if (pd <= asOfDate) cumPlan++;
    if (pd === asOfDate) dailyPlan++;
  }

  // 배차표 '설치제외' 이력(기준일까지) — 진행현황 시트 행 색칠·비고(I:N)용.
  // 사유 컬럼이 없는 DB(migration_exclude_reason.sql 미실행)면 사유 없이 목록만.
  const exclusions: ExclusionInfo[] = [];
  {
    const query = (cols: string) =>
      fetchAll<{ plate: string; date: string; exclude_reason?: string | null }>((from, to) =>
        supabase
          .from("dispatch_times")
          .select(cols)
          .eq("excluded", true)
          .lte("date", asOfDate)
          .order("date")
          .order("plate")
          .range(from, to) as never,
      );
    let rows: { plate: string; date: string; exclude_reason?: string | null }[] = [];
    try {
      rows = await query("plate, date, exclude_reason");
    } catch (e) {
      if (e instanceof Error && /exclude_reason/i.test(e.message)) {
        rows = await query("plate, date").catch(() => []);
      }
    }
    // 같은 차량이 여러 날 제외됐으면 가장 최근 사유만 남긴다(날짜 오름차순 조회 → 뒤가 최신)
    const byPlate = new Map<string, string>();
    for (const r of rows) byPlate.set(r.plate, (r.exclude_reason ?? "").trim());
    for (const [plate, reason] of byPlate) {
      const v = vmap.get(plate);
      exclusions.push({
        plate,
        operator: (v?.operator ?? "").trim(),
        route: (v?.route ?? "").trim(),
        reason,
      });
    }
  }

  // 비공개 버킷에서 템플릿 내려받기
  const { data: file, error: dlError } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .download(templateObject(slug));
  if (dlError || !file) {
    throw new Error("진행현황 양식이 없습니다 — 대시보드 '일정 업로드'로 전개현황 엑셀을 먼저 등록하세요.");
  }
  const template = Buffer.from(await file.arrayBuffer());

  const asOfSerial = excelSerialFromDate(asOfDate);
  const prefix = isDefault(slug) ? "인천버스" : ((await getProject(slug))?.name ?? slug);
  const { buffer, filled, added, removed } = isDefault(slug)
    ? await fillProgressXlsx(template, completed, asOfSerial, dailyPlan, cumPlan, dbInfo, exclusions)
    : await buildV2Progress(template, prefix, completed, asOfSerial, dbInfo, exclusions, parsePeriod(await getSetting(PROJECT_PERIOD_KEY, slug)));

  // 파일명: 기준일 YYMMDD
  const [yy, mm, dd] = asOfDate.split("-");
  const filename = `${prefix}_설치_전개현황_${yy.slice(2)}${mm}${dd}.xlsx`;

  return { buffer, filename, filled, added, removed };
}

// 새 프로젝트(B820 아님): 저장된 업로드 파일의 차량리스트 ⊕ DB → 마스터 양식(lib/export/v2-form.ts)으로 새로 만든다.
//   대상 차량(J≠제외·말소): 운수사·노선·번호·설치 예정일은 DB 값, 설치 완료여부/완료일(L/M)은 완료 맵.
//   DB에 없는 대상 차량 행은 뺀다(삭제), 파일에 없는 DB 차량(증차)은 뒤에 붙인다. 비대상 행은 그대로, 예시 행은 제외.
//   진행현황 시트는 마스터로 새로 만들므로 저장 양식(업로드 파일)의 운수사별 비고(M열)는 따로 읽어 다시 채운다
//   (업로드 뒤 비고가 사라진 10/13 실사례). 배차표 설치제외 차량은 그 뒤에 대수·차량번호로 덧붙인다.
export async function buildV2Progress(
  template: Buffer,
  name: string,
  completed: Map<string, CompletedInfo>,
  asOfSerial: number,
  dbInfo: Map<string, VehicleDbInfo>,
  exclusions: ExclusionInfo[],
  period: { start: string; end: string } | null,
): Promise<{ buffer: Buffer; filled: number; added: number; removed: number }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("차량리스트");
  if (!ws) throw new Error("저장된 양식에 「차량리스트」 시트가 없습니다. 일정 업로드로 다시 등록하세요.");
  const rows = readVehicleTable(ws).rows.filter((r) => !isExample(r));
  const seen = new Set<string>();
  let filled = 0;
  let removed = 0;
  const out: VehicleRow[] = [];
  for (const r of rows) {
    if (!isTarget(r)) {
      out.push(r);
      continue;
    }
    const plate = String(r[VCOL.plate]);
    const db = dbInfo.get(plate);
    if (!db) {
      removed++;
      continue;
    }
    seen.add(plate);
    if (db.operator) r[VCOL.operator] = db.operator;
    if (db.route) r[VCOL.route] = db.route;
    if (db.listNo != null) r[VCOL.listNo] = db.listNo;
    r[VCOL.planned] = db.serial;
    const done = completed.get(plate);
    r[VCOL.done] = done ? "완료" : null;
    r[VCOL.doneDate] = done ? done.serial : null;
    if (done) filled++;
    out.push(r);
  }
  let added = 0;
  for (const [plate, db] of dbInfo) {
    if (seen.has(plate)) continue;
    const done = completed.get(plate);
    out.push({
      [VCOL.listNo]: db.listNo, [VCOL.operator]: db.operator, [VCOL.route]: db.route, [VCOL.plate]: plate,
      [VCOL.target]: "대상", [VCOL.planned]: db.serial, [VCOL.done]: done ? "완료" : null, [VCOL.doneDate]: done ? done.serial : null,
    });
    added++;
    if (done) filled++;
  }
  // 번호(list_no) 순, 같으면 원래 순서
  const order = new Map(out.map((r, i) => [r, i]));
  const no = (r: VehicleRow) => (typeof r[VCOL.listNo] === "number" ? (r[VCOL.listNo] as number) : Infinity);
  out.sort((a, b) => no(a) - no(b) || order.get(a)! - order.get(b)!);
  const operatorNotes = savedNotes(wb, "설치 진행현황");
  const excl = new Map<string, string[]>();
  for (const e of exclusions) excl.set(e.operator, [...(excl.get(e.operator) ?? []), e.plate + (e.reason ? `(${e.reason})` : "")]);
  for (const [op, plates] of excl) {
    const line = `설치제외 ${plates.length}대: ${plates.join(", ")}`;
    const prev = operatorNotes.get(op);
    operatorNotes.set(op, prev && !prev.includes(line) ? `${prev} / ${line}` : line);
  }
  const buffer = await buildV2Workbook({
    name,
    vehicles: out,
    period,
    asOfSerial,
    operatorNotes,
    surveyNotes: savedNotes(wb, "실사 진행현황"),
  });
  return { buffer, filled, added, removed };
}

// 저장 양식의 진행현황 시트(운수사 블록 12행~합계 전)에서 운수사(B) → 비고(M)를 읽는다.
function savedNotes(wb: ExcelJS.Workbook, sheet: string): Map<string, string> {
  const notes = new Map<string, string>();
  const ws = wb.getWorksheet(sheet);
  if (!ws) return notes;
  for (let r = 12; r <= ws.rowCount; r++) {
    const op = cellText(ws.getRow(r).getCell("B").value).trim();
    if (!op || op.replace(/\s/g, "") === "합계") break;
    const note = cellText(ws.getRow(r).getCell("M").value).trim();
    if (note) notes.set(op, note);
  }
  return notes;
}
