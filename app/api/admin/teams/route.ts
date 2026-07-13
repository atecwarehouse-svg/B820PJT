import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getInstallTeams, setSetting, INSTALL_TEAMS_KEY } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → 설치팀 목록 (관리자 페이지 팀 관리 섹션용)
export async function GET() {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const list = await getInstallTeams();
  return NextResponse.json({ list });
}

// PUT { list: string[] } → 설치팀 목록 저장 (전체 교체)
export async function PUT(req: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { list?: unknown } | null;
  if (!body || !Array.isArray(body.list)) {
    return NextResponse.json({ error: "list(배열)가 필요합니다." }, { status: 400 });
  }
  const list = [...new Set(body.list.map((v) => String(v).trim()).filter(Boolean))].slice(0, 50);
  const tooLong = list.filter((s) => s.length > 40);
  if (tooLong.length > 0) {
    return NextResponse.json(
      { error: `팀명이 너무 깁니다(40자 이하): ${tooLong.join(", ")}` },
      { status: 400 },
    );
  }
  try {
    await setSetting(INSTALL_TEAMS_KEY, JSON.stringify(list));
  } catch (e) {
    return NextResponse.json(
      { error: "저장 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, list });
}
