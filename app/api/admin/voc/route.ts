import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/voc → 저장된 운수사 VOC 목록 (설치일 최신순)
export async function GET() {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("vocs")
    .select("*")
    .order("date", { ascending: false })
    .order("operator")
    .limit(300);
  if (error) {
    // 테이블 미생성(마이그레이션 전)
    if (/vocs/i.test(error.message)) {
      return NextResponse.json({ list: [], needMigration: true, error: null });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ list: data ?? [] });
}

// PATCH /api/admin/voc → 저장된 VOC 수정 (id + items/day_off/notes)
// operator·date는 식별키라 수정 불가.
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

  const update: Record<string, unknown> = {};

  if (Array.isArray(body.items)) {
    update.items = body.items.slice(0, 300).map((raw) => {
      const i = (raw ?? {}) as Record<string, unknown>;
      return {
        plate: String(i.plate ?? "").trim().slice(0, 20),
        route: String(i.route ?? "").trim().slice(0, 30) || undefined,
        voc: String(i.voc ?? "").trim().slice(0, 300),
      };
    });
  }
  if (Array.isArray(body.day_off)) {
    update.day_off = body.day_off
      .slice(0, 300)
      .map((p) => String(p ?? "").trim().slice(0, 20))
      .filter(Boolean);
  }
  if ("notes" in body) {
    const s = String(body.notes ?? "").trim();
    update.notes = s === "" ? null : s.slice(0, 500);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "수정할 내용이 없습니다." }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("vocs")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, item: data });
}

// DELETE /api/admin/voc?id=123 → VOC 삭제
export async function DELETE(req: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const supabase = createServiceClient();
  const { error } = await supabase.from("vocs").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
