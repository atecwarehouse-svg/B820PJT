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
