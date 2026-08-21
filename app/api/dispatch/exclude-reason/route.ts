import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/dispatch/exclude-reason  { date, plate, reason }
// 금일완료 리포트에서 적은 '설치제외 사유'를 배차표 행에 저장한다.
// 진행현황 엑셀(진행현황 시트 비고 I:N)이 이 값을 읽어 쓴다.
// 타코 사유와 같은 이유로 배차표 POST(upsert)가 아니라 있는 행만 update한다.
export async function POST(req: NextRequest) {
  let body: { date?: unknown; plate?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const date = String(body.date ?? "").trim();
  const plate = String(body.plate ?? "").trim();
  const reason = String(body.reason ?? "").trim().slice(0, 200) || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !plate) {
    return NextResponse.json({ error: "날짜와 차량번호를 확인하세요." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("dispatch_times")
    .update({ exclude_reason: reason, updated_at: new Date().toISOString() })
    .eq("date", date)
    .eq("plate", plate)
    .select("plate")
    .maybeSingle();

  if (error) {
    const msg = /exclude_reason/i.test(error.message)
      ? "DB 준비가 안 됐습니다. supabase/migration_exclude_reason.sql을 실행해주세요."
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
