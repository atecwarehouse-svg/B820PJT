import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/dispatch/tacho  { date, plate, reason }
// 타코 미연결 사유만 고친다 — 금일완료 리포트 화면에서 수정한 값을 배차표와 같은
// 곳(dispatch_times.tacho_reason)에 그대로 반영해 두 화면이 갈리지 않게 한다.
//
// 배차표 POST(/api/dispatch)를 쓰지 않는 이유: 그쪽은 upsert라 운수사·노선을 함께
// 써버려서, 그 값을 모르는 리포트 화면이 호출하면 멀쩡한 값을 지운다.
// 여기서는 이미 있는 행만 update한다(사유는 배차표에서 적었으므로 행이 반드시 있다).
export async function POST(req: NextRequest) {
  let body: { date?: unknown; plate?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const date = String(body.date ?? "").trim();
  const plate = String(body.plate ?? "").trim();
  // 빈 사유 = 미연결 해제(타코 정상으로 되돌리기)
  const reason = String(body.reason ?? "").trim().slice(0, 200) || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !plate) {
    return NextResponse.json({ error: "날짜와 차량번호를 확인하세요." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("dispatch_times")
    .update({ tacho_reason: reason, updated_at: new Date().toISOString() })
    .eq("date", date)
    .eq("plate", plate)
    .select("plate")
    .maybeSingle();

  if (error) {
    const msg = /tacho_reason/i.test(error.message)
      ? "DB 준비가 안 됐습니다. supabase/migration_dispatch_tacho_off.sql을 실행해주세요."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "배차표에 없는 차량입니다. 배차표에서 먼저 저장해주세요." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, reason });
}
