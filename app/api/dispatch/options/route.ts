import { NextResponse } from "next/server";
import { loadOperatorSchedules } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dispatch/options
// 배차표 팝업 — 운수사·설치예정일·노선별 대수 선택지(모달 열 때 1회 조회).
export async function GET() {
  try {
    const operators = await loadOperatorSchedules();
    return NextResponse.json({ operators });
  } catch {
    return NextResponse.json({ operators: [] });
  }
}
