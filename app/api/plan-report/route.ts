import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPlanReportCard, type PlanReportGroup } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/plan-report — 대시보드 '설치계획 보고' 버튼.
// 금일 계획(운수사·노선·대수)+집합시간·설치장소를 시작보고/협의사항 두 채팅방에 전송.
// 협의사항방 카드에는 consultations 저장 데이터(휴차·도착시간·협조확인·설치위치·특이사항)를 병합.
export async function POST(req: NextRequest) {
  let body: { label?: unknown; date?: unknown; groups?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const label = String(body.label ?? "").trim().slice(0, 30);
  const date = String(body.date ?? "").trim();
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

  // 협의사항 저장 데이터 병합 — 협의사항방 카드 전용 항목(도착시간·협조확인·설치위치·특이사항).
  // 테이블 미생성(마이그레이션 전)이면 병합 없이 진행.
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    try {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("consultations")
        .select(
          "operator, arrival, key_method, engine_on, fuel, mount_display, mount_main, mount_board, handle_removal, notes",
        )
        .eq("date", date);
      if (!error) {
        const byOp = new Map((data ?? []).map((c) => [c.operator, c]));
        for (const g of groups) {
          const c = byOp.get(g.operator);
          if (!c) continue;
          g.arrival = c.arrival ?? undefined;
          g.keyMethod = c.key_method ?? undefined;
          g.engineOn = c.engine_on ?? undefined;
          g.fuel = c.fuel ?? undefined;
          g.mountDisplay = c.mount_display ?? undefined;
          g.mountMain = c.mount_main ?? undefined;
          g.mountBoard = c.mount_board ?? undefined;
          g.handleRemoval = c.handle_removal ?? undefined;
          g.notes = c.notes ?? undefined;
        }
      }
    } catch {
      // 병합 실패해도 보고 자체는 진행
    }
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
