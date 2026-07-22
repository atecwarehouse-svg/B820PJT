import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dispatch/excluded?date=YYYY-MM-DD
// 배차표에서 '설치제외' 체크된 차량 목록 — 금일완료 리포트 특이사항 자동 입력용.
// excluded 컬럼 없는 DB(마이그레이션 전)나 조회 실패 시 빈 목록(기능만 생략).
export async function GET(req: NextRequest) {
  const date = (req.nextUrl.searchParams.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ plates: [] });
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("dispatch_times")
    .select("plate, route")
    .eq("date", date)
    .eq("excluded", true)
    .order("plate")
    .range(0, 999);
  if (error || !data?.length) {
    return NextResponse.json({ plates: [] });
  }
  // 일정 재업로드로 예정일이 바뀌었거나 삭제된 차량의 옛 제외 기록은 제외 —
  // 그날 예정(planned_date=date)인 차량과 교집합만 리포트에 올린다.
  const plates = data.map((r) => r.plate).filter(Boolean);
  const { data: veh, error: vehError } = await supabase
    .from("vehicles")
    .select("plate")
    .eq("planned_date", date)
    .in("plate", plates.slice(0, 500));
  if (vehError) {
    return NextResponse.json({ plates: [] });
  }
  const planned = new Set((veh ?? []).map((v) => v.plate));
  return NextResponse.json({
    plates: plates.filter((p) => planned.has(p)),
  });
}
