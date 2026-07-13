// 진행현황 양식 채운 xlsx 버퍼 생성 — 다운로드 라우트와 리포트 메일 첨부가 공유.
// 완료(saved_at) 데이터를 읽어 Supabase 비공개 버킷의 템플릿 차량리스트를 채운다.

import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import {
  fillProgressXlsx,
  type CompletedInfo,
  type VehicleDbInfo,
} from "@/lib/export/fill-progress-xlsx";
import { workDateString, workDateExcelSerial, excelSerialFromDate } from "@/lib/work-day";

const TEMPLATE_BUCKET = process.env.TEMPLATE_BUCKET ?? "templates";
const TEMPLATE_OBJECT = process.env.TEMPLATE_OBJECT ?? "progress-template.xlsx";

// asOfDate: 기준일(업무일 "YYYY-MM-DD"). 지정 없으면 현재 업무일.
//  - 완료(차량리스트 G/H)는 기준일까지 완료된 것만 채움 → 그 날짜 시점 스냅샷.
//  - 계획수량은 차량 설치예정일(planned_date) 기준: 금일(A6)=당일, 누적(F6)=기준일까지.
export async function buildProgressXlsx(opts?: { asOfDate?: string }): Promise<{
  buffer: Buffer;
  filename: string;
  filled: number;
  added: number;
  removed: number;
}> {
  const supabase = createServiceClient();

  const asOfDate =
    opts?.asOfDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.asOfDate)
      ? opts.asOfDate
      : workDateString(new Date());

  // 완료(saved_at 있음) 레코드 + 차량 운수사/노선/예정일 전수 조회
  const [recs, vrows] = await Promise.all([
    fetchAll<{ plate: string; saved_at: string }>((from, to) =>
      supabase
        .from("records")
        .select("plate, saved_at")
        .not("saved_at", "is", null)
        .range(from, to),
    ),
    // select("*"): list_no 컬럼이 아직 없는 DB(migration_list_no.sql 미실행)에서도 동작
    fetchAll<{
      plate: string;
      operator: string | null;
      route: string | null;
      planned_date: string | null;
      list_no?: number | null;
    }>((from, to) => supabase.from("vehicles").select("*").range(from, to)),
  ]);

  const vmap = new Map(vrows.map((v) => [v.plate, v]));
  const completed = new Map<string, CompletedInfo>();
  for (const r of recs) {
    if (!r.plate || !r.saved_at) continue;
    // 기준일까지 완료된 것만 (스냅샷) — 완료 업무일이 기준일 이후면 제외
    if (workDateString(r.saved_at) > asOfDate) continue;
    const v = vmap.get(r.plate);
    completed.set(r.plate, {
      serial: workDateExcelSerial(r.saved_at),
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

  // 비공개 버킷에서 템플릿 내려받기
  const { data: file, error: dlError } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .download(TEMPLATE_OBJECT);
  if (dlError || !file) {
    throw new Error("양식 템플릿을 불러올 수 없습니다. (Storage 업로드 필요)");
  }
  const template = Buffer.from(await file.arrayBuffer());

  const asOfSerial = excelSerialFromDate(asOfDate);
  const { buffer, filled, added, removed } = await fillProgressXlsx(
    template,
    completed,
    asOfSerial,
    dailyPlan,
    cumPlan,
    dbInfo,
  );

  // 파일명: 기준일 YYMMDD
  const [yy, mm, dd] = asOfDate.split("-");
  const filename = `인천버스_설치_전개현황_${yy.slice(2)}${mm}${dd}.xlsx`;

  return { buffer, filename, filled, added, removed };
}
