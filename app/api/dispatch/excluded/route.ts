import { NextRequest, NextResponse } from "next/server";
import { loadTodayExcludedPlates, loadTodayTachoOff } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dispatch/excluded?date=YYYY-MM-DD
// 배차표에서 금일완료 리포트 특이사항으로 넘길 항목:
//   plates   — '설치제외' 체크된 차량 (사유는 리포트 화면에서 입력)
//   tachoOff — '타코 미연결' 차량과 사유 (사유는 배차표에서 이미 입력됨)
// 판정은 대시보드 금일 타일과 같은 함수를 쓴다(두 벌로 두면 기준이 갈린다).
// 조회 실패 시 빈 목록(기능만 생략).
export async function GET(req: NextRequest) {
  const date = (req.nextUrl.searchParams.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ plates: [], tachoOff: [] });
  }
  const [plates, tachoOff] = await Promise.all([
    loadTodayExcludedPlates(date).catch(() => []),
    loadTodayTachoOff(date).catch(() => []),
  ]);
  return NextResponse.json({ plates, tachoOff });
}
