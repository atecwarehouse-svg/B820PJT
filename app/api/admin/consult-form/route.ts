import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { CONSULT_FORM_KEY, getConsultConfig, setSetting } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/server";
import {
  DEFAULT_CONSULT_FIELDS,
  isDefaultConsultConfig,
  validateConsultConfig,
} from "@/lib/consultation-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 운수사 협의사항 폼 양식 — 관리자 페이지 '협의사항 양식' 탭. 프로젝트별(app_settings.consult_form).
//   GET    → { fields, isDefault, defaults }
//   PUT    [ {key,label,title,options,enabled}… ] → 검증 후 저장 (전체 교체)
//   DELETE → 기본값(B820 양식)으로 되돌리기
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  const fields = await getConsultConfig();
  return NextResponse.json({ fields, isDefault: isDefaultConsultConfig(fields), defaults: DEFAULT_CONSULT_FIELDS });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const fields = validateConsultConfig(body);
  if (typeof fields === "string") return NextResponse.json({ error: fields }, { status: 400 });
  try {
    await setSetting(CONSULT_FORM_KEY, JSON.stringify(fields));
  } catch (e) {
    return NextResponse.json(
      { error: "저장 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, fields, isDefault: isDefaultConsultConfig(fields) });
}

export async function DELETE() {
  if (!(await isAdmin())) return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  try {
    await createServiceClient().from("app_settings").delete().eq("key", CONSULT_FORM_KEY);
  } catch (e) {
    return NextResponse.json(
      { error: "초기화 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, fields: DEFAULT_CONSULT_FIELDS, isDefault: true });
}
