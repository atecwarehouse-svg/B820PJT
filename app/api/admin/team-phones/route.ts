import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import {
  getInstallTeamPhones,
  setSetting,
  INSTALL_TEAM_PHONES_KEY,
  type TeamPhone,
} from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → 설치팀 연락처 목록 (관리자 페이지 연락처 관리 섹션용)
export async function GET() {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const list = await getInstallTeamPhones();
  return NextResponse.json({ list });
}

// PUT { list: {name,phone}[] } → 설치팀 연락처 저장 (전체 교체)
export async function PUT(req: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { list?: unknown } | null;
  if (!body || !Array.isArray(body.list)) {
    return NextResponse.json({ error: "list(배열)가 필요합니다." }, { status: 400 });
  }
  const list: TeamPhone[] = body.list
    .map((v) => ({
      name: String((v as TeamPhone)?.name ?? "").trim(),
      phone: String((v as TeamPhone)?.phone ?? "").trim(),
    }))
    .filter((v) => v.name && v.phone)
    .slice(0, 50);
  if (list.some((v) => v.name.length > 40)) {
    return NextResponse.json({ error: "이름은 40자 이하로 입력하세요." }, { status: 400 });
  }
  const badPhone = list.find((v) => !/^[0-9+\-() ]{7,20}$/.test(v.phone));
  if (badPhone) {
    return NextResponse.json(
      { error: `전화번호 형식을 확인하세요: ${badPhone.phone}` },
      { status: 400 },
    );
  }
  try {
    await setSetting(INSTALL_TEAM_PHONES_KEY, JSON.stringify(list));
  } catch (e) {
    return NextResponse.json(
      { error: "저장 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, list });
}
