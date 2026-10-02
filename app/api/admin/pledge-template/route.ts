import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getPledgeTemplate, setSetting, PLEDGE_TEMPLATE_KEY } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_PLEDGE_TEMPLATE, isDefaultPledgeTemplate, validatePledgeTemplate } from "@/lib/pledge-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 안전관리 서약서 양식 — 관리자 페이지 '서약서 양식' 탭. 프로젝트별(app_settings.safety_pledge).
//   GET    → { template, isDefault, defaults }
//   PUT    { title, company, eduItems, pledgeText } → 검증 후 저장 (전체 교체)
//   DELETE → 기준양식(버스단말기설치 양식)으로 되돌리기
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  const template = await getPledgeTemplate();
  return NextResponse.json({ template, isDefault: isDefaultPledgeTemplate(template), defaults: DEFAULT_PLEDGE_TEMPLATE });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const t = validatePledgeTemplate(body);
  if (typeof t === "string") return NextResponse.json({ error: t }, { status: 400 });
  try {
    await setSetting(PLEDGE_TEMPLATE_KEY, JSON.stringify(t));
  } catch (e) {
    return NextResponse.json({ error: "저장 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") }, { status: 500 });
  }
  return NextResponse.json({ ok: true, template: t, isDefault: isDefaultPledgeTemplate(t) });
}

export async function DELETE() {
  if (!(await isAdmin())) return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  try {
    await createServiceClient().from("app_settings").delete().eq("key", PLEDGE_TEMPLATE_KEY);
  } catch (e) {
    return NextResponse.json({ error: "초기화 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") }, { status: 500 });
  }
  return NextResponse.json({ ok: true, template: DEFAULT_PLEDGE_TEMPLATE, isDefault: true });
}
