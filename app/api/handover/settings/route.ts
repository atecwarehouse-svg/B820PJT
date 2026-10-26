import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { setSetting } from "@/lib/settings";
import {
  HANDOVER_CENTERS_KEY,
  HANDOVER_WEBHOOKS_KEY,
  HANDOVER_WEBHOOK_KEY,
  HANDOVER_WEEKLY_KEY,
  HANDOVER_WORKERS_KEY,
  WEBHOOK_RE,
  centerNames,
  getCenters,
  getWebhook,
  getWebhooks,
  getWeeklyUntil,
  getWorkers,
  type CenterMap,
  type Worker,
} from "@/lib/handover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 체크리스트 관리자 설정 — 관리자 쿠키 필수.
//   GET → { centers: {영업소:센터}, workers: [{center,rank,name}], offices: [{name,count}], centerNames: string[], webhook, webhooks: {센터:url}, weeklyUntil }
//         offices = 업로드된 차량의 영업소별 대수, centerNames = 차량 센터(osupdate) ∪ 맵 ∪ 작업자 소속, weeklyUntil = 매주 수요일 진척율 카드 종료일("" = 안 보냄)
//   PUT { centers?, workers?, webhook?: string, webhooks?: {센터:url}, weeklyUntil?: "YYYY-MM-DD"|"" } → 보낸 것만 저장(전체 교체). webhook "" = 해제(env 폴백)
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET() {
  if (!(await isAdmin())) return bad("관리자 인증이 필요합니다.", 401);
  const sb = createServiceClient();
  const [centers, workers, webhook, webhooks, weeklyUntil, rows] = await Promise.all([
    getCenters(),
    getWorkers(),
    getWebhook(),
    getWebhooks(),
    getWeeklyUntil(),
    fetchAll<{ operator: string; center: string | null }>((from, to) => sb.from("vehicles").select("operator, center").order("plate").range(from, to)).catch(() => []),
  ]);
  const count = new Map<string, number>();
  const vehicleCenters = new Set<string>();
  for (const r of rows) {
    count.set(r.operator, (count.get(r.operator) ?? 0) + 1);
    if (r.center) vehicleCenters.add(r.center);
  }
  const offices = [...count.entries()].map(([name, c]) => ({ name, count: c }));
  const names = [...new Set([...vehicleCenters, ...centerNames(centers, workers)])];
  return NextResponse.json({ centers, workers, offices, centerNames: names, webhook: webhook ?? "", webhooks, weeklyUntil: weeklyUntil ?? "" });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return bad("관리자 인증이 필요합니다.", 401);
  const body = (await req.json().catch(() => null)) as {
    centers?: unknown;
    workers?: unknown;
    webhook?: unknown;
    webhooks?: unknown;
    weeklyUntil?: unknown;
  } | null;
  if (!body || [body.centers, body.workers, body.webhook, body.webhooks, body.weeklyUntil].every((x) => x === undefined)) {
    return bad("centers·workers·webhook·webhooks·weeklyUntil 중 하나가 필요합니다.");
  }

  let weeklyUntil: string | undefined;
  if (body.weeklyUntil !== undefined) {
    if (typeof body.weeklyUntil !== "string") return bad("weeklyUntil 형식이 잘못되었습니다.");
    weeklyUntil = body.weeklyUntil.trim();
    if (weeklyUntil && Number.isNaN(Date.parse(weeklyUntil + "T00:00:00+09:00"))) return bad("주간 공유 종료일은 YYYY-MM-DD 형식이어야 합니다.");
    if (weeklyUntil && !/^\d{4}-\d{2}-\d{2}$/.test(weeklyUntil)) return bad("주간 공유 종료일은 YYYY-MM-DD 형식이어야 합니다.");
  }

  const badUrl = (u: string) => !WEBHOOK_RE.test(u) || u.length > 2000;
  let webhook: string | undefined;
  if (body.webhook !== undefined) {
    if (typeof body.webhook !== "string") return bad("webhook 형식이 잘못되었습니다.");
    webhook = body.webhook.trim();
    if (webhook && badUrl(webhook)) return bad("웹훅 주소는 https:// 로 시작하는 주소여야 합니다.");
  }
  let webhooks: Record<string, string> | undefined;
  if (body.webhooks !== undefined) {
    if (!body.webhooks || typeof body.webhooks !== "object" || Array.isArray(body.webhooks)) return bad("webhooks 형식이 잘못되었습니다.");
    webhooks = {};
    for (const [c, u] of Object.entries(body.webhooks as Record<string, unknown>)) {
      const url = String(u ?? "").trim();
      if (!c.trim() || !url) continue; // 비운 센터는 저장하지 않음(기본 웹훅으로)
      if (badUrl(url)) return bad(`${c} 웹훅 주소는 https:// 로 시작하는 주소여야 합니다.`);
      webhooks[c.trim()] = url;
    }
  }

  let centers: CenterMap | undefined;
  if (body.centers !== undefined) {
    if (!body.centers || typeof body.centers !== "object" || Array.isArray(body.centers)) return bad("centers 형식이 잘못되었습니다.");
    centers = {};
    for (const [office, c] of Object.entries(body.centers as Record<string, unknown>)) {
      const center = String(c ?? "").trim();
      if (!office.trim() || !center) continue; // 미배정은 저장하지 않음
      if (center.length > 30) return bad("센터명은 30자 이하로 입력하세요.");
      centers[office.trim()] = center;
    }
  }
  let workers: Worker[] | undefined;
  if (body.workers !== undefined) {
    if (!Array.isArray(body.workers)) return bad("workers 형식이 잘못되었습니다.");
    workers = body.workers
      .map((w) => ({
        center: String((w as Worker)?.center ?? "").trim(),
        rank: String((w as Worker)?.rank ?? "").trim(),
        name: String((w as Worker)?.name ?? "").trim(),
      }))
      .filter((w) => w.name || w.center || w.rank)
      .slice(0, 100);
    const incomplete = workers.find((w) => !w.center || !w.name);
    if (incomplete) return bad(`센터와 이름은 비울 수 없습니다: ${incomplete.rank || incomplete.name || incomplete.center}`);
    if (workers.some((w) => w.center.length > 30 || w.rank.length > 40 || w.name.length > 40)) {
      return bad("센터 30자·직급·이름 40자 이하로 입력하세요.");
    }
    const dup = workers.find((w, i) => workers!.findIndex((x) => x.center === w.center && x.name === w.name) !== i);
    if (dup) return bad(`같은 센터에 같은 이름이 두 번 있습니다: ${dup.center} ${dup.name}`);
  }
  try {
    if (centers) await setSetting(HANDOVER_CENTERS_KEY, JSON.stringify(centers));
    if (workers) await setSetting(HANDOVER_WORKERS_KEY, JSON.stringify(workers));
    if (webhook !== undefined) await setSetting(HANDOVER_WEBHOOK_KEY, webhook);
    if (webhooks) await setSetting(HANDOVER_WEBHOOKS_KEY, JSON.stringify(webhooks));
    if (weeklyUntil !== undefined) await setSetting(HANDOVER_WEEKLY_KEY, weeklyUntil);
  } catch (e) {
    return bad("저장 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류"), 500);
  }
  return NextResponse.json({
    ok: true,
    centers: centers ?? (await getCenters()),
    workers: workers ?? (await getWorkers()),
    webhook: webhook ?? (await getWebhook()) ?? "",
    webhooks: webhooks ?? (await getWebhooks()),
    weeklyUntil: weeklyUntil ?? (await getWeeklyUntil()) ?? "",
  });
}
