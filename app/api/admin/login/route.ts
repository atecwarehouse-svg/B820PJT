import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_MAX_AGE,
  adminCookieName,
  checkAdminPassword,
  expectedAdminToken,
} from "@/lib/admin-auth";
import { currentSlug } from "@/lib/project";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/login  { password }  → 현재 프로젝트의 비밀번호와 일치하면 httpOnly 쿠키 발급
// (B820=환경변수 비밀번호·쿠키 admin_auth, 그 외 프로젝트=만들 때 정한 비밀번호·쿠키 admin_auth_<slug>)
export async function POST(req: NextRequest) {
  const slug = currentSlug();
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (!(await checkAdminPassword(password, slug))) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  const token = await expectedAdminToken(slug);
  const res = NextResponse.json({ ok: true });
  // 쿠키에는 비밀번호가 아니라 해시를 담는다(평문 노출 방지)
  res.cookies.set(adminCookieName(slug), token ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_MAX_AGE,
  });
  return res;
}

// DELETE /api/admin/login  → 로그아웃(현재 프로젝트 쿠키 제거)
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(adminCookieName(currentSlug()), "", { path: "/", maxAge: 0 });
  return res;
}
