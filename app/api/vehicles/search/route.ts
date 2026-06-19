import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/vehicles/search?q=인천70  → 차량번호 부분일치 목록
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ results: [] });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("plate, operator, route")
    .ilike("plate", `%${q}%`)
    .order("plate")
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ results: data ?? [] });
}
