import { NextResponse } from "next/server";
import { loadInProgressList } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/vehicles/in-progress
// 진행중(사진 1장 이상 13장 미만) 차량 목록 — 관리자 호출 모달의 차량 선택용.
export async function GET() {
  try {
    const results = await loadInProgressList();
    return NextResponse.json({ results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "조회 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
