import { NextRequest, NextResponse } from "next/server";
import { sendProgressCard, sendStartReportCard } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ShareBody {
  kind?: string; // "start" = 설치 시작 보고 카드, 그 외 = 진행 현황 카드
  label?: string;
  todayPlanned?: number;
  complete?: number;
  inProgress?: number;
  remain?: number;
  // 설치 시작 보고용 — 금일 계획의 운수사·노선별 대수
  groups?: { operator?: string; route?: string; planned?: number }[];
}

// POST /api/teams/share  → 설치 진행 현황(또는 설치 시작 보고) 카드를 Teams 채널에 전송
export async function POST(req: NextRequest) {
  const b = (await req.json()) as ShareBody;
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
  try {
    if (b.kind === "start") {
      const groups = (Array.isArray(b.groups) ? b.groups : []).slice(0, 50).map((g) => ({
        operator: (g?.operator ?? "").toString().slice(0, 40),
        route: (g?.route ?? "").toString().slice(0, 40),
        planned: n(g?.planned),
      }));
      await sendStartReportCard({
        label: (b.label ?? "").toString().slice(0, 40),
        todayPlanned: n(b.todayPlanned),
        complete: n(b.complete),
        remain: n(b.remain),
        groups,
      });
    } else {
      await sendProgressCard({
        label: (b.label ?? "").toString().slice(0, 40),
        todayPlanned: n(b.todayPlanned),
        inProgress: n(b.inProgress),
        complete: n(b.complete),
        remain: n(b.remain),
      });
    }
  } catch (e) {
    return NextResponse.json(
      { error: "팀즈 전송 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
