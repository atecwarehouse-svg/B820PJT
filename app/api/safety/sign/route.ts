import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SignBody {
  sessionId?: string;
  name?: string;
  phase?: "before" | "after";
  signature?: string; // PNG data URL
  signatureId?: number; // phase==="after" 일 때 갱신할 설치전 서명 행 id
}

// POST /api/safety/sign  → 작업자 서명 저장
//  - phase="before": 새 행 생성 (이름 + 설치 전 서명). 입력 순서대로 쌓임(id 오름차순).
//  - phase="after" : 기존 행(signatureId)에 설치 후 서명 갱신.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as SignBody;
  const sessionId = (body.sessionId ?? "").trim();
  const signature = body.signature ?? "";
  const phase = body.phase;

  if (!sessionId) {
    return NextResponse.json({ error: "세션 정보가 없습니다." }, { status: 400 });
  }
  if (!signature.startsWith("data:image/")) {
    return NextResponse.json({ error: "서명을 입력하세요." }, { status: 400 });
  }
  if (phase !== "before" && phase !== "after") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  if (phase === "before") {
    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
    }
    // 세션 존재 확인
    const { data: sess } = await supabase
      .from("pledge_sessions")
      .select("id")
      .eq("id", sessionId)
      .maybeSingle();
    if (!sess) {
      return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("pledge_signatures")
      .insert({
        session_id: sessionId,
        worker_name: name,
        sig_before: signature,
        before_at: now,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id });
  }

  // phase === "after" — 안전관리자가 '설치 종료'를 눌러야만 열림
  const { data: sess } = await supabase
    .from("pledge_sessions")
    .select("ended_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!sess.ended_at) {
    return NextResponse.json(
      { error: "아직 설치가 종료되지 않았습니다. 안전관리자의 '설치 종료' 후 서명할 수 있습니다." },
      { status: 409 },
    );
  }

  const sigId = body.signatureId;
  if (typeof sigId !== "number") {
    return NextResponse.json(
      { error: "설치 전 서명을 먼저 선택하세요." },
      { status: 400 },
    );
  }
  const { data, error } = await supabase
    .from("pledge_signatures")
    .update({ sig_after: signature, after_at: now })
    .eq("id", sigId)
    .eq("session_id", sessionId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: "대상 서명을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  return NextResponse.json({ id: data.id });
}
