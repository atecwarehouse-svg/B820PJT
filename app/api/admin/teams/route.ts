import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import {
  getInstallTeamsFull,
  setSetting,
  INSTALL_TEAMS_KEY,
  type InstallTeam,
} from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → 설치팀 목록(팀명·이름·전화) — 관리자 페이지 팀 관리 섹션용
export async function GET() {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const list = await getInstallTeamsFull();
  return NextResponse.json({ list });
}

// PUT { list: {team,name,phone}[] } → 설치팀 목록 저장 (전체 교체)
export async function PUT(req: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { list?: unknown } | null;
  if (!body || !Array.isArray(body.list)) {
    return NextResponse.json({ error: "list(배열)가 필요합니다." }, { status: 400 });
  }
  const list: InstallTeam[] = body.list
    .map((v) => ({
      team: String((v as InstallTeam)?.team ?? "").trim(),
      name: String((v as InstallTeam)?.name ?? "").trim(),
      phone: String((v as InstallTeam)?.phone ?? "").trim(),
    }))
    .filter((v) => v.team)
    .slice(0, 50);
  if (list.some((v) => v.team.length > 40 || v.name.length > 40)) {
    return NextResponse.json({ error: "팀명·이름은 40자 이하로 입력하세요." }, { status: 400 });
  }
  const badPhone = list.find((v) => v.phone && !/^[0-9+\-() ]{7,20}$/.test(v.phone));
  if (badPhone) {
    return NextResponse.json(
      { error: `전화번호 형식을 확인하세요: ${badPhone.phone}` },
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
