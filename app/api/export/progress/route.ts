import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fillProgressXlsx, type CompletedInfo } from "@/lib/export/fill-progress-xlsx";
import { fetchAll } from "@/lib/supabase/paginate";
import { workDateExcelSerial } from "@/lib/work-day";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 양식 템플릿(차량리스트 전체 = 개인정보)은 공개 저장소가 아닌 Supabase 비공개 버킷에 보관.
// scripts/upload-template.ts 로 1회 업로드. (버킷/경로는 env로 덮어쓸 수 있음)
const TEMPLATE_BUCKET = process.env.TEMPLATE_BUCKET ?? "templates";
const TEMPLATE_OBJECT = process.env.TEMPLATE_OBJECT ?? "progress-template.xlsx";

// GET /api/export/progress
// 완료(저장)된 차량의 plate/saved_at을 읽어 양식 차량리스트 G/H만 채운 xlsx 다운로드.
// 양식의 집계 시트는 함수(COUNTIFS)로 자동 계산되므로 그대로 보존된다.
export async function GET() {
  const supabase = createServiceClient();

  // 완료(saved_at 있음) 레코드 + 차량 운수사/노선(증차 append·매칭용) 전수 조회
  let recs: { plate: string; saved_at: string }[];
  let vrows: { plate: string; operator: string | null; route: string | null }[];
  try {
    [recs, vrows] = await Promise.all([
      fetchAll((from, to) =>
        supabase
          .from("records")
          .select("plate, saved_at")
          .not("saved_at", "is", null)
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase.from("vehicles").select("plate, operator, route").range(from, to),
      ),
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "조회 실패" },
      { status: 500 },
    );
  }

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

  // Supabase 비공개 버킷에서 양식 템플릿 내려받기
  const { data: file, error: dlError } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .download(TEMPLATE_OBJECT);
  if (dlError || !file) {
    console.error("[export/progress] 템플릿 다운로드 실패:", dlError?.message);
    return NextResponse.json(
      { error: "양식 템플릿을 불러올 수 없습니다. (Storage 업로드 필요)" },
      { status: 500 },
    );
  }
  const template = Buffer.from(await file.arrayBuffer());

  const { buffer, filled, added } = await fillProgressXlsx(template, completed);
  console.log(
    `[export/progress] 완료 ${completed.size}대 → 기존 ${filled}대 채움, 증차 ${added}대 추가`,
  );

  // 파일명: 인천버스_설치_전개현황_YYMMDD.xlsx (KST 오늘)
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/-/g, "");
  const filename = encodeURIComponent(`인천버스_설치_전개현황_${today}.xlsx`);

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
