import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SignBody {
  sessionId?: string;
  name?: string;
  phase?: "before" | "after";
  signature?: string; // PNG data URL
  signatureId?: number; // 갱신할 서명 행 id (after 필수 / before는 기존 서명 수정 시)
  overwrite?: boolean; // phase==="after"에서 이미 완료된 서명을 교체(수정)할 때
}

// POST /api/safety/sign  → 작업자 서명 저장
//  - phase="before": 새 행 생성 (이름 + 설치 전 서명). signatureId 있으면 기존 행 서명 수정.
//  - phase="after" : 기존 행(signatureId)에 설치 후 서명 갱신. overwrite면 완료된 서명도 교체.
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
    // 설치 전 서명 1회로 완료 — 설치 후 서명도 같은 서명으로 자동 입력
    // (작업자는 전 서명만 하면 되고, 설치 후 링크·미서명 집계는 자연히 0)
    const bothSigs = {
      sig_before: signature,
      before_at: now,
      sig_after: signature,
      after_at: now,
    };
    // 기존 행 서명 수정(재서명) — 이름 선택으로 대상 행이 특정됨
    if (typeof body.signatureId === "number") {
      const { data, error } = await supabase
        .from("pledge_signatures")
        .update(bothSigs)
        .eq("id", body.signatureId)
        .eq("session_id", sessionId)
        .select("id")
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) {
        return NextResponse.json({ error: "대상 서명을 찾을 수 없습니다." }, { status: 409 });
      }
      return NextResponse.json({ id: data.id });
    }

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
        ...bothSigs,
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
  // 이미 서명된 행은 덮어쓰지 않는다 — 두 사람이 같은 이름 행을 골라 서명하면
  // (동명이인·오래된 목록) 먼저 한 서명이 소리 없이 사라진다.
  // 단, overwrite(서명 수정)는 완료된 행을 명시적으로 골라 교체하는 것이므로 허용.
  let query = supabase
    .from("pledge_signatures")
    .update({ sig_after: signature, after_at: now })
    .eq("id", sigId)
    .eq("session_id", sessionId);
  if (!body.overwrite) query = query.is("sig_after", null);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    // 행이 없거나, 그 사이 다른 사람이 이미 서명을 완료한 경우
    const { data: row } = await supabase
      .from("pledge_signatures")
      .select("sig_after")
      .eq("id", sigId)
      .eq("session_id", sessionId)
      .maybeSingle();
    return NextResponse.json(
      {
        error: row?.sig_after
          ? "이미 서명이 완료된 이름입니다. 목록을 새로고침해 본인 이름을 다시 선택해주세요."
          : "대상 서명을 찾을 수 없습니다.",
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ id: data.id });
}
