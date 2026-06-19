import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/vehicles/[plate]  → 운수사/노선 단건 조회
export async function GET(
  _req: NextRequest,
  { params }: { params: { plate: string } },
) {
  const plate = decodeURIComponent(params.plate).trim();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("plate, operator, route")
    .eq("plate", plate)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "차량을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ vehicle: data });
}
