// 진행현황 양식 채운 xlsx 버퍼 생성 — 다운로드 라우트와 리포트 메일 첨부가 공유.
// 완료(saved_at) 데이터를 읽어 Supabase 비공개 버킷의 템플릿 차량리스트를 채운다.

import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { fillProgressXlsx, type CompletedInfo } from "@/lib/export/fill-progress-xlsx";
import { workDateExcelSerial } from "@/lib/work-day";

const TEMPLATE_BUCKET = process.env.TEMPLATE_BUCKET ?? "templates";
const TEMPLATE_OBJECT = process.env.TEMPLATE_OBJECT ?? "progress-template.xlsx";

export async function buildProgressXlsx(): Promise<{
  buffer: Buffer;
  filename: string;
  filled: number;
  added: number;
}> {
  const supabase = createServiceClient();

  // 완료(saved_at 있음) 레코드 + 차량 운수사/노선(증차 append·매칭용) 전수 조회
  const [recs, vrows] = await Promise.all([
    fetchAll<{ plate: string; saved_at: string }>((from, to) =>
      supabase
        .from("records")
        .select("plate, saved_at")
        .not("saved_at", "is", null)
        .range(from, to),
    ),
    fetchAll<{ plate: string; operator: string | null; route: string | null }>((from, to) =>
      supabase.from("vehicles").select("plate, operator, route").range(from, to),
    ),
  ]);

  const vmap = new Map(vrows.map((v) => [v.plate, v]));
  const completed = new Map<string, CompletedInfo>();
  for (const r of recs) {
    if (!r.plate || !r.saved_at) continue;
    const v = vmap.get(r.plate);
    completed.set(r.plate, {
      serial: workDateExcelSerial(r.saved_at),
      operator: (v?.operator ?? "").trim(),
      route: (v?.route ?? "").trim(),
    });
  }

  // 비공개 버킷에서 템플릿 내려받기
  const { data: file, error: dlError } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .download(TEMPLATE_OBJECT);
  if (dlError || !file) {
    throw new Error("양식 템플릿을 불러올 수 없습니다. (Storage 업로드 필요)");
  }
  const template = Buffer.from(await file.arrayBuffer());

  // 진행현황 기준일(A10) = 생성 시점 업무일
  const asOfSerial = workDateExcelSerial(new Date());
  const { buffer, filled, added } = await fillProgressXlsx(template, completed, asOfSerial);

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/-/g, "");
  const filename = `인천버스_설치_전개현황_${today}.xlsx`;

  return { buffer, filename, filled, added };
}
