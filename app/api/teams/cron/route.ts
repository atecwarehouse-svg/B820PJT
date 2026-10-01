import { NextRequest, NextResponse } from "next/server";
import {
  loadStats,
  loadInProgressList,
  loadScheduleStats,
  loadInstallProgress,
} from "@/lib/stats";
import { workDateString, weekdayLabel } from "@/lib/work-day";
import { sendProgressCard } from "@/lib/teams";
import { brandName, isDefault, listProjects, type Project } from "@/lib/project";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// B820 설치 시작일 — 이 날짜 이전 업무일엔 발송하지 않음 (다른 프로젝트는 예정 수량 0이면 자연히 건너뜀)
const START_DATE = "2026-07-01";

// GET /api/teams/cron  → Vercel 크론(매일 02:00 KST)이 호출.
// 앨범 프로젝트마다 "설치일(예정 수량>0)"일 때 팀즈 진행현황 카드를 자동 발송한다.
// 크론은 요청 컨텍스트(x-project)가 없으므로 프로젝트별로 slug를 명시해 집계한다.
export async function GET(req: NextRequest) {
  // Vercel 크론 보호.
  //  - CRON_SECRET이 있으면 Authorization 헤더로 검증(권장 — Vercel이 자동으로 붙여준다).
  //  - 없으면 최소한 Vercel 크론이 붙이는 x-vercel-cron 헤더라도 요구한다.
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? req.headers.get("authorization") === `Bearer ${secret}`
    : !!req.headers.get("x-vercel-cron");
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const workDay = workDateString(new Date()); // 현재 업무일(익일 12:00 이전이면 전날)
  const projects = (await listProjects()).filter((p) => p.kind === "album");
  const results = [];
  for (const p of projects) {
    results.push({ slug: p.slug, ...(await runFor(p, workDay)) });
  }
  return NextResponse.json({ workDay, results });
}

async function runFor(p: Project, workDay: string): Promise<Record<string, unknown>> {
  if (isDefault(p.slug) && workDay < START_DATE) {
    return { skipped: true, reason: `설치 시작(${START_DATE}) 이전` };
  }

  let s, inProgressList, sch, ip;
  try {
    [s, inProgressList, sch, ip] = await Promise.all([
      loadStats(p.slug),
      loadInProgressList(p.slug),
      loadScheduleStats(p.slug),
      loadInstallProgress(p.slug),
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "집계 실패" };
  }

  const planned = sch.days.find((d) => d.date === workDay)?.planned ?? 0;
  if (planned === 0) {
    return { skipped: true, reason: "설치일 아님(예정 수량 0)" };
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
      projectName: brandName(p),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "전송 실패" };
  }

  return { sent: true, planned, todayDone, complete, inProgress, remain };
}
