import { NextRequest, NextResponse } from "next/server";
import {
  PROGRESS_COOKIE,
  PROGRESS_MAX_AGE,
  progressDownloadPassword,
} from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/progress/unlock  { password } → 일치 시 대시보드 상세 잠금 해제 쿠키 발급
export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (!password || password !== progressDownloadPassword()) {
    return NextResponse.json(
      { error: "비밀번호가 올바르지 않습니다." },
      { status: 401 },
    );
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PROGRESS_COOKIE, progressDownloadPassword(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PROGRESS_MAX_AGE,
  });
  return res;
}

// DELETE /api/progress/unlock → 다시 잠그기
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PROGRESS_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
