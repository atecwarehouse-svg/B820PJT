import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/modem → 등록된 LTE 모뎀불량 목록 (최신순)
// 삭제는 배차표와 같은 경로(POST /api/modem, clear=1 — DB 행 + Drive 사진)를 쓴다.
export async function GET() {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("modem_defects")
    .select("id, date, plate, operator, kind, symptom, before_sn, after_sn")
    .order("date", { ascending: false })
    .order("plate")
    .limit(300);
  if (error) {
    // 테이블 미생성(마이그레이션 전)
    if (/modem_defects/i.test(error.message)) {
      return NextResponse.json({ list: [], needMigration: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ list: data ?? [] });
}
