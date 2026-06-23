import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createServiceClient } from "@/lib/supabase/server";
import { fillProgressXlsx, excelSerialFromKST } from "@/lib/export/fill-progress-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE = 1000;
const TEMPLATE_PATH = path.join(
  process.cwd(),
  "lib/export/templates/진행현황_template.xlsx",
);

// GET /api/export/progress
// 완료(저장)된 차량의 plate/saved_at을 읽어 양식 차량리스트 G/H만 채운 xlsx 다운로드.
// 양식의 집계 시트는 함수(COUNTIFS)로 자동 계산되므로 그대로 보존된다.
export async function GET() {
  const supabase = createServiceClient();

  // 완료분만 — saved_at 있는 레코드 전수 (1000행 페이지네이션)
  const completed = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("records")
      .select("plate, saved_at")
      .not("saved_at", "is", null)
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const r of data ?? []) {
      if (r.plate && r.saved_at) {
        completed.set(r.plate, excelSerialFromKST(r.saved_at));
      }
    }
    if (!data || data.length < PAGE) break;
  }

  let template: Buffer;
  try {
    template = readFileSync(TEMPLATE_PATH);
  } catch {
    return NextResponse.json(
      { error: "양식 템플릿 파일을 찾을 수 없습니다." },
      { status: 500 },
    );
  }

  const { buffer, filled, missing } = await fillProgressXlsx(template, completed);
  if (missing > 0) {
    console.warn(`[export/progress] 양식 차량리스트에 없는 완료 차량 ${missing}대 무시됨`);
  }
  console.log(`[export/progress] 완료 ${completed.size}대 중 ${filled}대 채움`);

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
