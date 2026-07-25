import { NextRequest, NextResponse } from "next/server";
import { adminPassword, isAdmin } from "@/lib/admin-auth";
import { getInstallTeamsFull } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?pw= → 설치팀 연락처(전화번호 있는 팀만) — 홈 '설치팀 호출' 버튼용.
// 관리자 비밀번호(pw) 또는 관리자 로그인 쿠키 필수.
export async function GET(req: NextRequest) {
  const pw = req.nextUrl.searchParams.get("pw") ?? "";
  if (!isAdmin() && pw !== adminPassword()) {
    return NextResponse.json({ error: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  const list = (await getInstallTeamsFull()).filter((t) => t.phone);
  return NextResponse.json({ list });
}
