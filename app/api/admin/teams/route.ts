import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import {
  getInstallTeamsFull,
  getTeamCompanies,
  setSetting,
  INSTALL_TEAMS_KEY,
  TEAM_COMPANIES_KEY,
  type InstallTeam,
} from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → { list: 설치팀 목록(팀명·이름·전화·소속), companies: 소속사 목록 } — 관리자 페이지 설치팀·소속 탭용
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const [list, companies] = await Promise.all([getInstallTeamsFull(), getTeamCompanies()]);
  return NextResponse.json({ list, companies });
}

// PUT { list: {team,name,phone,company}[], companies?: string[] } → 설치팀 목록(+소속사 목록) 저장 (전체 교체)
//   companies를 보내면 소속사 목록도 바꾼다(소속 탭). 팀의 소속은 그 목록 안에 있어야 한다.
export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { list?: unknown; companies?: unknown } | null;
  if (!body || !Array.isArray(body.list)) {
    return NextResponse.json({ error: "list(배열)가 필요합니다." }, { status: 400 });
  }
  const list: InstallTeam[] = body.list
    .map((v) => ({
      team: String((v as InstallTeam)?.team ?? "").trim(),
      name: String((v as InstallTeam)?.name ?? "").trim(),
      phone: String((v as InstallTeam)?.phone ?? "").trim(),
      company: String((v as InstallTeam)?.company ?? "").trim(),
    }))
    .filter((v) => v.team)
    .slice(0, 50);
  if (list.some((v) => v.team.length > 40 || v.name.length > 40)) {
    return NextResponse.json({ error: "팀명·이름은 40자 이하로 입력하세요." }, { status: 400 });
  }
  let companies: string[] | null = null;
  if (body.companies !== undefined) {
    if (!Array.isArray(body.companies)) return NextResponse.json({ error: "companies(배열) 형식이 잘못되었습니다." }, { status: 400 });
    companies = [...new Set(body.companies.map((c) => String(c ?? "").trim()).filter(Boolean))].slice(0, 30);
    if (companies.some((c) => c.length > 30)) {
      return NextResponse.json({ error: "소속사 이름은 30자 이하로 입력하세요." }, { status: 400 });
    }
  }
  const allowed = companies ?? (await getTeamCompanies());
  const bad = list.find((v) => v.company && !allowed.includes(v.company));
  if (bad) {
    return NextResponse.json(
      { error: `소속 "${bad.company}"이(가) 소속사 목록에 없습니다. 소속 탭에서 먼저 추가하세요.` },
      { status: 400 },
    );
  }
  const badPhone = list.find((v) => v.phone && !/^[0-9+\-() ]{7,20}$/.test(v.phone));
  if (badPhone) {
    return NextResponse.json(
      { error: `전화번호 형식을 확인하세요: ${badPhone.phone}` },
      { status: 400 },
    );
  }
  try {
    if (companies) await setSetting(TEAM_COMPANIES_KEY, JSON.stringify(companies));
    await setSetting(INSTALL_TEAMS_KEY, JSON.stringify(list));
  } catch (e) {
    return NextResponse.json(
      { error: "저장 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, list, companies: companies ?? allowed });
}
