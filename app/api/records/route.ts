import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { CustomSlot } from "@/lib/slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UpsertBody {
  plate: string;
  year?: string | null;
  model?: string | null;
  custom_slots?: CustomSlot[];
  saved?: boolean; // true면 '저장'(목록 등록) 처리 → saved_at = now()
}

// POST /api/records  → 레코드 upsert (연식/차종/커스텀 슬롯 저장)
// 차량(vehicles)이 존재해야 하며, 운수사/노선/설치일자는 서버에서 채운다.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as UpsertBody;
  const plate = (body.plate ?? "").trim();
  if (!plate) {
    return NextResponse.json({ error: "차량번호가 필요합니다." }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 차량 마스터 확인 (운수사/노선 스냅샷용)
  const { data: vehicle, error: vErr } = await supabase
    .from("vehicles")
    .select("plate, operator, route")
    .eq("plate", plate)
    .maybeSingle();
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
  if (!vehicle) {
    return NextResponse.json(
      { error: "차량리스트에 없는 차량번호입니다." },
      { status: 404 },
    );
  }

  // 기존 레코드의 install_date 보존 (없으면 today 기본값)
  const { data: existing } = await supabase
    .from("records")
    .select("install_date")
    .eq("plate", plate)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    plate,
    operator: vehicle.operator,
    route: vehicle.route,
    year: body.year ?? null,
    model: body.model ?? null,
    custom_slots: body.custom_slots ?? [],
    updated_at: new Date().toISOString(),
  };
  if (existing?.install_date) {
    payload.install_date = existing.install_date;
  }
  if (body.saved) {
    payload.saved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("records")
    .upsert(payload, { onConflict: "plate" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ record: data });
}
