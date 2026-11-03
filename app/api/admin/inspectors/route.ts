import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { INSPECTORS_KEY, getSetting, setSetting } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/server";
import { defaultInspectorMap, inspectorWebhooks } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 검수자(이름 → 팀즈 개인방 웹훅) — 관리자 '검수자' 탭. 프로젝트별(app_settings.inspectors).
//   GET    → { list: [{name,url}], isDefault, defaults: 기본 4명 이름 }
//   PUT    { list: [{name,url}] } → 검증 후 저장 (전체 교체 — 기본 4명을 빼면 빠진다)
//   DELETE → 기본(환경변수 TEAMS_INSPECTOR_WEBHOOKS 4명)으로 되돌리기
const toList = (map: Record<string, string>) => Object.entries(map).map(([name, url]) => ({ name, url }));

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  const [raw, map] = await Promise.all([getSetting(INSPECTORS_KEY), inspectorWebhooks()]);
  return NextResponse.json({ list: toList(map), isDefault: raw === null, defaults: Object.keys(defaultInspectorMap()) });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { list?: unknown } | null;
  if (!body || !Array.isArray(body.list)) return NextResponse.json({ error: "list(배열)가 필요합니다." }, { status: 400 });
  // 이름이 키라 프로토타입 없는 객체 — 일반 객체면 "constructor" 같은 이름이 '중복'으로 잘못 걸린다
  const map: Record<string, string> = Object.create(null);
  for (const it of body.list.slice(0, 30) as { name?: unknown; url?: unknown }[]) {
    const name = String(it?.name ?? "").trim();
    const url = String(it?.url ?? "").trim();
    if (!name && !url) continue; // 빈 줄
    if (!name || name.length > 20) return NextResponse.json({ error: "검수자 이름은 1~20자로 입력하세요." }, { status: 400 });
    if (!/^https:\/\/\S+$/.test(url)) return NextResponse.json({ error: `${name}: 팀즈 웹훅 주소(https://…)를 입력하세요.` }, { status: 400 });
    if (map[name]) return NextResponse.json({ error: `검수자 이름이 중복됩니다: ${name}` }, { status: 400 });
    map[name] = url;
  }
  try {
    await setSetting(INSPECTORS_KEY, JSON.stringify(map));
  } catch (e) {
    return NextResponse.json({ error: "저장 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") }, { status: 500 });
  }
  return NextResponse.json({ ok: true, list: toList(map), isDefault: false });
}

export async function DELETE() {
  if (!(await isAdmin())) return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  try {
    await createServiceClient().from("app_settings").delete().eq("key", INSPECTORS_KEY);
  } catch (e) {
    return NextResponse.json({ error: "초기화 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") }, { status: 500 });
  }
  return NextResponse.json({ ok: true, list: toList(defaultInspectorMap()), isDefault: true });
}
