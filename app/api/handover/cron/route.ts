import { NextRequest, NextResponse } from "next/server";
import { isChecklist, listProjects, type Project } from "@/lib/project";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { getCenters, getWebhook, getWebhooks, getWeeklyUntil, vehicleCenter } from "@/lib/handover";
import { sendWeeklyProgressCard, type WeeklyProgress } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/handover/cron — Vercel 크론(vercel.json: 매주 수요일 00:00 UTC = 09:00 KST).
//   체크리스트형 프로젝트(osupdate·handover) 중 주간 공유 종료일(handover_weekly_until)이 오늘 이후인 것만,
//   센터마다 그 센터 웹훅(없으면 기본 → env)으로 진척율 카드(센터·시내/마을·전체, 이번 주 완료 수, 종료 D-day).
//   크론은 요청 컨텍스트(x-project)가 없으므로 slug 를 명시해 집계한다.
const KST = "Asia/Seoul";
const todayKst = () => new Date().toLocaleDateString("sv-SE", { timeZone: KST });

type Row = { operator: string; center: string | null; bus_type: string | null; done_at: string | null };

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized = secret ? req.headers.get("authorization") === `Bearer ${secret}` : !!req.headers.get("x-vercel-cron");
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = todayKst();
  const projects = (await listProjects()).filter((p) => isChecklist(p.kind));
  const results = [];
  for (const p of projects) results.push({ slug: p.slug, ...(await runFor(p, today)) });
  return NextResponse.json({ today, results });
}

async function runFor(p: Project, today: string): Promise<Record<string, unknown>> {
  const until = await getWeeklyUntil(p.slug);
  if (!until) return { skipped: true, reason: "주간 공유 미설정" };
  if (today > until) return { skipped: true, reason: `종료일(${until}) 지남` };

  const sb = createServiceClient(p.slug);
  let rows: Row[];
  try {
    rows = await fetchAll<Row>((from, to) => sb.from("vehicles").select("operator, center, bus_type, done_at").order("plate").range(from, to));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "조회 실패" };
  }
  if (!rows.length) return { skipped: true, reason: "차량 없음" };

  const [centers, hooks, base] = await Promise.all([getCenters(p.slug), getWebhooks(p.slug), getWebhook(p.slug)]);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const stat = (label: string, xs: Row[]): WeeklyProgress => ({
    label,
    total: xs.length,
    done: xs.filter((r) => r.done_at).length,
    week: xs.filter((r) => r.done_at && Date.parse(r.done_at) >= weekAgo).length,
  });
  const daysLeft = Math.max(0, Math.round((Date.parse(until + "T00:00:00+09:00") - Date.parse(today + "T00:00:00+09:00")) / 86_400_000));
  const overall = stat("전체", rows);
  const kindLabel = p.kind === "osupdate" ? "OS업데이트 적용" : "양도양수";

  const byCenter = new Map<string, Row[]>();
  for (const r of rows) {
    const c = vehicleCenter(r, centers);
    byCenter.set(c, [...(byCenter.get(c) ?? []), r]);
  }
  const sent: string[] = [];
  const noHook: string[] = [];
  const failed: string[] = [];
  for (const [center, xs] of byCenter) {
    if (center === "미배정") continue;
    const webhook = hooks[center] ?? base ?? process.env.TEAMS_ADMIN_CALL_WEBHOOK_URL;
    if (!webhook) {
      noHook.push(center);
      continue;
    }
    const byType = ["시내버스", "마을버스"].map((t) => stat(t, xs.filter((r) => r.bus_type === t))).filter((s) => s.total > 0);
    try {
      // 센터 전용 방에는 그 센터 수치만(양도양수는 전체 줄 유지)
      await sendWeeklyProgressCard({ webhook, projectName: p.name, kindLabel, center: stat(center, xs), byType, overall: p.kind === "osupdate" ? undefined : overall, until, daysLeft });
      sent.push(center);
    } catch (e) {
      failed.push(`${center}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { until, daysLeft, sent, noHook, failed, overall };
}
