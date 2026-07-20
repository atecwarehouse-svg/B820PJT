import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { adminPassword, isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 한국시간 HH:mm
function kstHm(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// POST /api/safety/session/end  body: { sessionId }
// 안전관리자가 '설치 종료'를 누르면 종료 시각을 기록한다.
// → 이 시점 이후부터 작업자의 '설치 후' 서명이 열린다.
export async function POST(req: NextRequest) {
  const { sessionId, password } = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    password?: string;
  };
  if (password !== adminPassword() && !isAdmin()) {
    return NextResponse.json(
      { error: "관리자 비밀번호가 올바르지 않습니다." },
      { status: 401 },
    );
  }
  const id = (sessionId ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "세션 정보가 없습니다." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: sess } = await supabase
    .from("pledge_sessions")
    .select("id, ended_at")
    .eq("id", id)
    .maybeSingle();
  if (!sess) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }
  if (sess.ended_at) {
    return NextResponse.json({ ok: true, alreadyEnded: true });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("pledge_sessions")
    .update({ ended_at: now, end_time: kstHm() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
