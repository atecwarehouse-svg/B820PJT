import { NextResponse } from "next/server";
import { loadInstallProgress } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/voc/vehicles → 설치 완료 차량 목록(운수사·노선·완료 업무일).
// VOC 접수 팝업이 열릴 때만 호출한다 — 홈 화면은 이 조회를 하지 않으므로
// 현장에서 가장 많이 쓰는 첫 화면이 느려지지 않는다.
export async function GET() {
  try {
    const ip = await loadInstallProgress();
    return NextResponse.json({ list: ip.completedList });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "조회 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
