import { NextRequest, NextResponse } from "next/server";
import { currentSlug } from "@/lib/project";
import { loadOperatorSchedules } from "@/lib/stats";
import { carryOverIfQuota } from "@/lib/quota";
import { getCustom } from "@/lib/settings";
import { companyOf } from "@/lib/route-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dispatch/options
// 배차표 팝업 — 운수사·설치예정일·노선별 대수 선택지(모달 열 때 1회 조회).
export async function GET(req: NextRequest) {
  try {
    const slug = currentSlug();
    await carryOverIfQuota(slug); // 수량 차감 방식 — 지난 미완료 차량을 다음 예정일로 이월한 뒤 목록(멱등)
    // 운수사 단위(공항버스) — 영업소를 회사 이름으로 합쳐서 고르게 한다.
    // 배차표 창(?by=company)만 — 설치 일정변경 창도 이 주소를 쓰는데 거기는 실제 운수사 이름이 필요하다.
    const byCompany =
      req.nextUrl.searchParams.get("by") === "company" && (await getCustom(slug)).flags.dispatchByCompany;
    const operators = await loadOperatorSchedules(slug, byCompany ? companyOf : undefined);
    return NextResponse.json({ operators });
  } catch {
    return NextResponse.json({ operators: [] });
  }
}
