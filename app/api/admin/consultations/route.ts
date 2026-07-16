import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/consultations → 저장된 운수사 협의사항 목록 (설치일 최신순)
export async function GET() {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("consultations")
    .select("*")
    .order("date", { ascending: false })
    .order("operator")
    .limit(300);
  if (error) {
    // 테이블 미생성(마이그레이션 전)
    if (/consultations/i.test(error.message)) {
      return NextResponse.json({
        list: [],
        needMigration: true,
        error: null,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ list: data ?? [] });
}

// 관리자 수정 가능한 컬럼 화이트리스트 (operator·date는 식별키라 수정 불가).
// count만 숫자, 나머지는 문자열(빈 값은 null 저장).
const EDITABLE_TEXT = [
  "routes",
  "list_check",
  "list_change",
  "place",
  "work_start",
  "day_off",
  "next_day_off",
  "arrival",
  "next_first_bus",
  "depot_out",
  "key_method",
  "engine_on",
  "fuel",
  "manager_day",
  "manager_night",
  "mount_display",
  "mount_main",
  "mount_board",
  "handle_removal",
  "notes",
  "consulter",
] as const;

// PATCH /api/admin/consultations → 저장된 협의사항 내용 수정 (id + 수정 필드)
export async function PATCH(req: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const update: Record<string, string | number | null> = {};

  if ("count" in body) {
    const n = Number(body.count);
    update.count = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }
  for (const key of EDITABLE_TEXT) {
    if (key in body) {
      const s = String(body[key] ?? "").trim();
      update[key] = s === "" ? null : s.slice(0, key === "notes" ? 500 : 300);
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "수정할 내용이 없습니다." }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("consultations")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, item: data });
}

// DELETE /api/admin/consultations?id=123 → 협의사항 삭제
export async function DELETE(req: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const supabase = createServiceClient();
  const { error } = await supabase.from("consultations").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
