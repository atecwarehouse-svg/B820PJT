import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendAdminCallCard } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS = ["자재 부족", "단말기 불량", "차량 문제", "기술 문의", "기타"] as const;

// POST /api/admin-call  { team, plate, reason, memo? }
// 홈 화면 "관리자 호출" 버튼 → 팀즈 채팅방으로 🚨 카드 전송.
export async function POST(req: NextRequest) {
  let body: { team?: unknown; plate?: unknown; reason?: unknown; memo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const team = String(body.team ?? "").trim().slice(0, 30);
  const plate = String(body.plate ?? "").trim().slice(0, 20);
  const reason = String(body.reason ?? "").trim();
  const memo = String(body.memo ?? "").trim().slice(0, 300);

  if (!team) {
    return NextResponse.json({ error: "팀명을 입력하세요." }, { status: 400 });
  }
  if (!plate) {
    return NextResponse.json({ error: "차량번호를 선택하세요." }, { status: 400 });
  }
  if (!(REASONS as readonly string[]).includes(reason)) {
    return NextResponse.json({ error: "호출 사유가 올바르지 않습니다." }, { status: 400 });
  }

  // 운수사·노선은 카드 표시용 — 조회 실패해도 호출 자체는 막지 않음.
  let operator: string | undefined;
  let route: string | undefined;
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("vehicles")
      .select("operator, route")
      .eq("plate", plate)
      .maybeSingle();
    operator = data?.operator ?? undefined;
    route = data?.route ?? undefined;
  } catch {
    // 조회 실패 무시 — 차량 정보 없이 전송
  }

  try {
    await sendAdminCallCard({ team, plate, operator, route, reason, memo: memo || undefined });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: `팀즈 전송 실패: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
