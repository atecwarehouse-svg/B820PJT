import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateBody {
  plate?: string;
  operator?: string;
  route?: string;
}

// POST /api/vehicles  → 증차 차량 추가 (마스터에 없던 차량번호 등록)
// 운수사·노선은 필수(vehicles not null). 이미 있으면 그대로 사용.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as CreateBody;
  const plate = (body.plate ?? "").trim();
  const operator = (body.operator ?? "").trim();
  const route = (body.route ?? "").trim();

  if (!plate) {
    return NextResponse.json({ error: "차량번호를 입력하세요." }, { status: 400 });
  }
  if (!operator || !route) {
    return NextResponse.json({ error: "운수사와 노선을 입력하세요." }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 이미 존재하면 추가하지 않고 그대로 사용(기존 마스터 차량 보호)
  const { data: existing, error: exErr } = await supabase
    .from("vehicles")
    .select("plate")
    .eq("plate", plate)
    .maybeSingle();
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  if (existing) {
    return NextResponse.json({ ok: true, exists: true, plate });
  }

  // is_added 컬럼이 있으면 증차 플래그 기록, 없으면(마이그레이션 전) 플래그 없이 추가
  let { error } = await supabase
    .from("vehicles")
    .insert({ plate, operator, route, is_added: true });
  if (error && /is_added/i.test(error.message)) {
    ({ error } = await supabase.from("vehicles").insert({ plate, operator, route }));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, created: true, plate });
}
