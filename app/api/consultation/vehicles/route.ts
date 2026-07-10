import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/consultation/vehicles?operator=...&date=YYYY-MM-DD
// 협의사항 팝업 '차량리스트 보기' — 해당 운수사·설치일의 차량번호 목록(노선 포함).
export async function GET(req: NextRequest) {
  const operator = (req.nextUrl.searchParams.get("operator") ?? "").trim();
  const date = (req.nextUrl.searchParams.get("date") ?? "").trim();
  if (!operator || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "운수사와 날짜를 확인하세요." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("plate, route")
    .eq("operator", operator)
    .eq("planned_date", date)
    .order("route")
    .order("plate")
    .range(0, 999);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ vehicles: data ?? [] });
}
