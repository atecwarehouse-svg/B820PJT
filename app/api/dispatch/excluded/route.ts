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
  if (error) {
    return NextResponse.json({ plates: [] });
  }
  return NextResponse.json({
    plates: (data ?? []).map((r) => r.plate),
  });
}
