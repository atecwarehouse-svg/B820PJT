import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { findRoute, runningBuses, firstTimeToday, beforeFirstTime, routeNoOf } from "@/lib/bis";
import { workDateString } from "@/lib/work-day";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/route-shot?date=YYYY-MM-DD
// 그날 설치한 노선 목록 + 지금 버스가 다니는지(인천 버스정보시스템 기준).
// 캡처 전에 "아직 첫차 전이라 안 뜨는 것"과 "떠야 하는데 안 뜨는 것"을 구분하려는 화면용.
export async function GET(req: NextRequest) {
  const dateRaw = (req.nextUrl.searchParams.get("date") ?? "").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : workDateString(new Date());

  const supabase = createServiceClient();
  const vehicles = await fetchAll<{ plate: string; operator: string | null; route: string | null }>(
    (from, to) =>
      supabase
        .from("vehicles")
        .select("plate, operator, route")
        .eq("planned_date", date)
        .order("plate")
        .range(from, to),
  ).catch(() => []);

  // (운수사|노선)별 묶기
  const groups = new Map<string, { operator: string; route: string; plates: string[] }>();
  for (const v of vehicles) {
    const operator = (v.operator ?? "").trim();
    const route = (v.route ?? "").trim();
    if (!route) continue;
    const key = `${operator}|||${route}`;
    const g = groups.get(key) ?? { operator, route, plates: [] };
    g.plates.push(v.plate);
    groups.set(key, g);
  }

  const now = new Date();
  const list = [...groups.values()].sort(
    (a, b) => a.operator.localeCompare(b.operator, "ko") || a.route.localeCompare(b.route, "ko"),
  );

  // BIS 조회 — 노선 수가 많은 날도 있어 5개씩 나눠 보낸다
  const routes: unknown[] = [];
  for (let i = 0; i < list.length; i += 5) {
    const part = await Promise.all(
      list.slice(i, i + 5).map(async (g) => {
        const routeNo = routeNoOf(g.route);
        try {
          const bis = await findRoute(routeNo, g.operator);
          if (!bis) {
            return {
              ...g,
              routeNo,
              count: g.plates.length,
              status: "nomatch",
              statusText: "버스정보시스템에서 노선을 못 찾음",
            };
          }
          const buses = await runningBuses(bis.routeId);
          const first = firstTimeToday(bis, now);
          // 오늘 설치한 차량이 실제로 뜨는지 — 차량번호 뒤 4자리로 대조
          const tails = new Set(
            g.plates.map((p) => (p.match(/(\d{4})\s*$/) || [])[1]).filter(Boolean) as string[],
          );
          const mine = buses.filter((b) => {
            const t = (b.match(/(\d{4})\s*$/) || [])[1];
            return t && tails.has(t);
          });
          const waiting = buses.length === 0 && beforeFirstTime(first, now);
          return {
            ...g,
            routeNo,
            count: g.plates.length,
            routeId: bis.routeId,
            bisOperator: bis.operator,
            origin: bis.origin,
            dest: bis.dest,
            firstTime: first,
            running: buses.length,
            mine: mine.length,
            status: waiting ? "waiting" : buses.length > 0 ? "running" : "none",
            statusText: waiting
              ? `차량출발대기중 (${first})`
              : buses.length > 0
                ? `운행중 ${buses.length}대` + (mine.length ? ` · 금일 설치 ${mine.length}대` : "")
                : `운행 없음 (첫차 ${first})`,
          };
        } catch (e) {
          return {
            ...g,
            routeNo,
            count: g.plates.length,
            status: "error",
            statusText: e instanceof Error ? e.message : "조회 실패",
          };
        }
      }),
    );
    routes.push(...part);
  }

  return NextResponse.json({ date, routes });
}
