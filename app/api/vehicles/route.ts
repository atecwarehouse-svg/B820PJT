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
// 차량번호 형식 — 한글 1자 + 숫자·한글 조합(예: 인천73아1585). 지역 표기가 붙거나
// 빠질 수 있어 느슨하게 잡되, 임의 문자열이 마스터에 꽂히는 것은 막는다.
const PLATE_RE = /^[가-힣0-9]{4,15}$/;

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const plate = (body.plate ?? "").trim();
  const operator = (body.operator ?? "").trim().slice(0, 50);
  const route = (body.route ?? "").trim().slice(0, 50);

  if (!plate) {
    return NextResponse.json({ error: "차량번호를 입력하세요." }, { status: 400 });
  }
  if (!PLATE_RE.test(plate)) {
    return NextResponse.json(
      { error: "차량번호 형식이 올바르지 않습니다. (예: 인천73아1585)" },
      { status: 400 },
    );
  }
  if (!operator || !route) {
    return NextResponse.json({ error: "운수사와 노선을 입력하세요." }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 이 API는 현장에서 로그인 없이 쓰므로(증차 차량 등록), 운수사는 이미 마스터에
  // 있는 이름만 허용한다 — 아무 이름이나 받으면 외부에서 유령 차량을 꽂아
  // 전체 대수(모든 통계의 분모)를 흔들 수 있다.
  const { data: knownOp, error: opErr } = await supabase
    .from("vehicles")
    .select("plate")
    .eq("operator", operator)
    .limit(1)
    .maybeSingle();
  if (opErr) return NextResponse.json({ error: opErr.message }, { status: 500 });
  if (!knownOp) {
    return NextResponse.json(
      { error: "등록되지 않은 운수사입니다. 운수사명을 확인해주세요." },
      { status: 400 },
    );
  }

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
