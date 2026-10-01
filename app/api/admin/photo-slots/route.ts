import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSlotConfig, setSetting, PHOTO_SLOTS_KEY } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/server";
import {
  DEFAULT_SLOT_CONFIG,
  isDefaultSlotConfig,
  toSlotConfigJson,
  validateSlotConfig,
} from "@/lib/slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 사진 양식(칸 구성) — 관리자 페이지 '사진 양식' 탭. 프로젝트별(app_settings.photo_slots).
//   GET    → { config, isDefault, defaults, used: {key: 사진 수} }
//   PUT    { before, after, check } → 검증 후 저장 (전체 교체)
//   DELETE → 기본값(B820 양식)으로 되돌리기
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  const config = await getSlotConfig();
  // 칸별로 이미 올라간 사진 수 — 칸을 지울 때 경고용
  const used: Record<string, number> = {};
  try {
    const sb = createServiceClient();
    // 칸별 정확한 건수 — B820은 사진 3만 장이 넘어 행을 가져와 세면 1만 행에서 잘린다
    const keys = [...config.before, ...config.after, ...config.afterExtra, ...config.check].map((s) => s.slotKey);
    const counts = await Promise.all(
      keys.map((k) =>
        sb
          .from(k.startsWith("check_") ? "check_photos" : "photos")
          .select("*", { count: "exact", head: true })
          .eq("slot_key", k),
      ),
    );
    keys.forEach((k, i) => {
      if (counts[i].count) used[k] = counts[i].count ?? 0;
    });
  } catch {
    // 부가 정보 — 실패해도 양식 편집은 가능
  }
  return NextResponse.json({
    config: toSlotConfigJson(config),
    isDefault: isDefaultSlotConfig(config),
    defaults: toSlotConfigJson(DEFAULT_SLOT_CONFIG),
    used,
  });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const c = validateSlotConfig(body);
  if (typeof c === "string") return NextResponse.json({ error: c }, { status: 400 });
  try {
    await setSetting(PHOTO_SLOTS_KEY, JSON.stringify(toSlotConfigJson(c)));
  } catch (e) {
    return NextResponse.json(
      { error: "저장 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, config: toSlotConfigJson(c), isDefault: isDefaultSlotConfig(c) });
}

export async function DELETE() {
  if (!(await isAdmin())) return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  try {
    await createServiceClient().from("app_settings").delete().eq("key", PHOTO_SLOTS_KEY);
  } catch (e) {
    return NextResponse.json(
      { error: "초기화 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, config: toSlotConfigJson(DEFAULT_SLOT_CONFIG), isDefault: true });
}
