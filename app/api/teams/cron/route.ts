import { NextRequest, NextResponse } from "next/server";
import {
  loadStats,
  loadInProgressList,
  loadScheduleStats,
  loadInstallProgress,
} from "@/lib/stats";
import { workDateString, weekdayLabel } from "@/lib/work-day";
import { sendProgressCard } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 설치 시작일 — 이 날짜 이전 업무일엔 발송하지 않음
const START_DATE = "2026-07-01";

// GET /api/teams/cron  → Vercel 크론(매일 02:00 KST)이 호출.
// "설치일(예정 수량>0) && 7/1 이후"일 때만 팀즈 카드 자동 발송.
export async function GET(req: NextRequest) {
  // Vercel 크론 보호.
  //  - CRON_SECRET이 있으면 Authorization 헤더로 검증(권장 — Vercel이 자동으로 붙여준다).
  //  - 없으면 최소한 Vercel 크론이 붙이는 x-vercel-cron 헤더라도 요구한다.
  //    (예전엔 CRON_SECRET 미설정 시 아무나 호출해 팀즈 카드를 쏠 수 있었다.
  //     완전한 차단은 Vercel 환경변수에 CRON_SECRET을 넣는 것)
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? req.headers.get("authorization") === `Bearer ${secret}`
    : !!req.headers.get("x-vercel-cron");
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const workDay = workDateString(new Date()); // 현재 업무일(익일 12:00 이전이면 전날)

  if (workDay < START_DATE) {
    return NextResponse.json({ skipped: true, reason: `설치 시작(${START_DATE}) 이전`, workDay });
  }

  let s, inProgressList, sch, ip;
  try {
    [s, inProgressList, sch, ip] = await Promise.all([
      loadStats(),
      loadInProgressList(),
      loadScheduleStats(),
      loadInstallProgress(),
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "집계 실패" },
      { status: 500 },
    );
  }

  const planned = sch.days.find((d) => d.date === workDay)?.planned ?? 0;
  if (planned === 0) {
    return NextResponse.json({ skipped: true, reason: "설치일 아님(예정 수량 0)", workDay });
  }

  const complete = s.complete;
  const inProgress = inProgressList.length;
  const todayDone = ip.todayComplete; // 금일 완료 (저장 + 설치 전·후 사진 전부 충족)
  const remain = Math.max(0, s.totalVehicles - complete - inProgress);

  try {
    await sendProgressCard({
      label: weekdayLabel(workDay),
      todayPlanned: planned,
      inProgress,
      todayDone,
      complete,
      remain,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "전송 실패", workDay },
      { status: 500 },
    );
  }

  return NextResponse.json({ sent: true, workDay, planned, todayDone, complete, inProgress, remain });
}
