import { NextRequest, NextResponse } from "next/server";
import { sendPlanReportCard, type PlanReportGroup } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/plan-report — 대시보드 '설치계획 보고' 버튼.
// 금일 계획(운수사·노선·대수) + 집합시간·설치장소·휴차를 시작보고/협의사항 두 채팅방에 전송.
export async function POST(req: NextRequest) {
  let body: { label?: unknown; groups?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const label = String(body.label ?? "").trim().slice(0, 30);
  if (!label) {
    return NextResponse.json({ error: "날짜가 없습니다." }, { status: 400 });
  }
  if (!Array.isArray(body.groups) || body.groups.length === 0) {
    return NextResponse.json({ error: "설치 계획이 없습니다." }, { status: 400 });
  }

  const str = (x: unknown, max = 100) => {
    const s = String(x ?? "").trim().slice(0, max);
    return s || undefined;
  };
  const timeStr = (x: unknown) => {
    const s = String(x ?? "").trim();
    return /^\d{2}:\d{2}$/.test(s) ? s : undefined;
  };

  const groups: PlanReportGroup[] = [];
  for (const raw of body.groups as Record<string, unknown>[]) {
    const operator = str(raw.operator, 50);
    if (!operator) continue;
    const routes = Array.isArray(raw.routes)
      ? (raw.routes as Record<string, unknown>[])
          .map((r) => ({
            route: str(r.route, 50) ?? "미지정",
            count: Number.isFinite(Number(r.count)) ? Math.floor(Number(r.count)) : 0,
          }))
          .filter((r) => r.count > 0)
      : [];
    const countNum = Number(raw.count);
    groups.push({
      operator,
      routes,
      count: Number.isFinite(countNum) && countNum > 0 ? Math.floor(countNum) : 0,
      time: timeStr(raw.time),
      place: str(raw.place),
      dayOff: str(raw.dayOff),
      nextDayOff: str(raw.nextDayOff),
    });
  }
  if (groups.length === 0) {
    return NextResponse.json({ error: "설치 계획이 없습니다." }, { status: 400 });
  }

  const total = groups.reduce((s, g) => s + g.count, 0);

  try {
    await sendPlanReportCard({ label, total, groups });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: `팀즈 전송 실패: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
