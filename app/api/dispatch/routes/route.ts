import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { chunk } from "@/lib/supabase/paginate";
import { stdSlotKeys } from "@/lib/slots";
import { getSetting, getSlotConfig, setSetting } from "@/lib/settings";
import { fetchCompletedMap } from "@/lib/stats";
import { kstDateString } from "@/lib/work-day";
import { parseRouteDispatch } from "@/lib/import/parse-route-dispatch";
import {
  END_AFTER_T1_MIN,
  addMinutes,
  companyOf,
  dayDispatchKey,
  dayTypeOf,
  readSummary,
  routeChanges,
  routeDispatchKey,
  routeDispatchPrefix,
  type RouteDispatchTable,
} from "@/lib/route-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 노선별 배차표 — 운수사가 날마다 주는 배차표 엑셀을 올려 두고 검수자가 노선별로 본다(기존 배차표와 별개).
// GET  ?company=&date= : 그 날짜 파일(04~09시 첫 출발 차량만, date 없으면 가장 최근 날짜) + 올라온 날짜 목록 + 차량별 설치 상태
// POST multipart { company, file } : 엑셀 파싱 → app_settings `route_dispatch:<회사>:<파일 날짜>` (같은 날짜면 교체)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
// 저장 키·like 검색에 쓰이므로 구분자(:)와 와일드카드(% _)는 뺀다
const cleanCompany = (v: unknown) => String(v ?? "").replace(/[:%_]/g, "").trim().slice(0, 50);

// 차량별 상태 — done(설치완료, 대시보드와 같은 판정) · working(기록 있음 = 작업 시작). 실패해도 표는 보여준다.
async function statusOf(table: RouteDispatchTable): Promise<Record<string, "done" | "working">> {
  const plates = [...new Set(table.blocks.flatMap((b) => b.rows.map((r) => r.plate)).filter(Boolean))];
  const out: Record<string, "done" | "working"> = {};
  try {
    const supabase = createServiceClient();
    for (const part of chunk(plates)) {
      const { data, error } = await supabase.from("records").select("plate").in("plate", part);
      if (error) return {};
      for (const r of data ?? []) out[r.plate] = "working";
    }
    const done = await fetchCompletedMap(supabase, stdSlotKeys(await getSlotConfig()));
    for (const p of plates) if (done.has(p)) out[p] = "done";
  } catch {
    return {};
  }
  return out;
}

// 이 회사로 올라온 날짜들(최근순)
async function datesOf(company: string): Promise<string[]> {
  const prefix = routeDispatchPrefix(company);
  const { data, error } = await createServiceClient()
    .from("app_settings")
    .select("key")
    .like("key", `${prefix}%`)
    .range(0, 999);
  if (error) return [];
  return (data ?? [])
    .map((r) => String(r.key).slice(prefix.length))
    .filter((d) => DATE_RE.test(d))
    .sort()
    .reverse();
}

// 배차표 엑셀 기준으로 진행현황 노선명(vehicles.route) 갱신 — 이 회사 차량 중 엑셀에 나온 차량만, 표기는 기존 것 유지.
// 바뀐 대수를 돌려준다. 실패하면 던진다(배차표 저장은 이미 끝난 뒤).
async function applyRoutes(company: string, plateRoutes: Record<string, string>): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("plate, route, operator")
    .like("operator", `${company}%`)
    .range(0, 4999);
  if (error) throw new Error(error.message);
  const mine = (data ?? []).filter((v) => companyOf(v.operator ?? "") === company);
  const changes = routeChanges(mine, plateRoutes);
  const byRoute = new Map<string, string[]>();
  for (const c of changes) byRoute.set(c.route, [...(byRoute.get(c.route) ?? []), c.plate]);
  for (const [route, plates] of byRoute) {
    for (const part of chunk(plates)) {
      const res = await supabase.from("vehicles").update({ route }).in("plate", part);
      if (res.error) throw new Error(res.error.message);
    }
  }
  return changes.length;
}

export async function GET(req: NextRequest) {
  const company = cleanCompany(req.nextUrl.searchParams.get("company"));
  if (!company) return bad("회사를 확인하세요.");
  const dates = await datesOf(company);
  const want = (req.nextUrl.searchParams.get("date") ?? "").trim();
  const date = dates.includes(want) ? want : dates[0];
  let table: RouteDispatchTable | null = null;
  if (date) {
    try {
      table = JSON.parse((await getSetting(routeDispatchKey(company, date))) ?? "null");
    } catch {
      table = null;
    }
  }
  if (!table || !Array.isArray(table.blocks)) return NextResponse.json({ table: null, dates, status: {} });
  return NextResponse.json({ table, dates, status: await statusOf(table) });
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("잘못된 요청입니다.");
  }
  const company = cleanCompany(form.get("company"));
  const file = form.get("file");
  if (!company) return bad("회사를 확인하세요.");
  if (!(file instanceof File) || file.size === 0) return bad("엑셀 파일을 선택하세요.");
  if (file.size > 4 * 1024 * 1024) return bad("파일이 너무 큽니다(4MB 이하).");
  if (!/\.xlsx?$/i.test(file.name)) return bad("엑셀(.xlsx/.xls) 파일만 올릴 수 있습니다.");

  let parsed: ReturnType<typeof parseRouteDispatch>;
  try {
    parsed = parseRouteDispatch(Buffer.from(await file.arrayBuffer()), company);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "파일을 읽지 못했습니다.");
  }
  // 당일 배차표 — 운행종료 시간(마지막 T1 출발 + 2시간)만 뽑아 따로 저장. 캡쳐용 표에만 쓰이고
  // 노선별 배차표·나가는 시간 자동 입력·진행현황 노선명은 건드리지 않는다.
  if (form.get("mode") === "day") {
    const date = DATE_RE.test(parsed.date) ? parsed.date : kstDateString();
    const last = parsed.plateLastT1[dayTypeOf(date)] ?? Object.values(parsed.plateLastT1)[0] ?? {};
    const ends = Object.fromEntries(Object.entries(last).map(([p, t]) => [p, addMinutes(t, END_AFTER_T1_MIN)]));
    try {
      await setSetting(dayDispatchKey(company, date), JSON.stringify({ fileName: file.name.slice(0, 200), date, ends }));
    } catch (e) {
      return bad(`저장 실패: ${e instanceof Error ? e.message : ""}`, 500);
    }
    const sm = parsed.summary[dayTypeOf(date)] ?? Object.values(parsed.summary)[0];
    const noT1 = (sm?.plates.length ?? 0) - Object.keys(ends).length;
    return NextResponse.json({
      date,
      count: Object.keys(ends).length,
      summary: readSummary(sm) + (noT1 > 0 ? ` · ⚠ T1 출발 시간이 없는 차량 ${noT1}대` : ""),
    });
  }
  const table: RouteDispatchTable = {
    company,
    fileName: file.name.slice(0, 200),
    date: DATE_RE.test(parsed.date) ? parsed.date : kstDateString(), // 파일에 날짜가 없으면 올린 날
    uploadedAt: new Date().toISOString(),
    blocks: parsed.blocks,
  };
  try {
    await setSetting(routeDispatchKey(company, table.date), JSON.stringify(table));
  } catch (e) {
    return bad(`저장 실패: ${e instanceof Error ? e.message : ""}`, 500);
  }
  // 진행현황 노선명 — 배차 날짜에 맞는 표(평일 / 토·휴일) 기준, 그 표가 없으면 있는 표
  let routeChanged: number | null = null;
  try {
    const pr = parsed.plateRoutes[dayTypeOf(table.date)] ?? Object.values(parsed.plateRoutes)[0] ?? {};
    routeChanged = await applyRoutes(company, pr);
  } catch {
    routeChanged = null; // 화면에 '노선명 반영 실패'로 알린다
  }
  return NextResponse.json({
    table,
    dates: await datesOf(company),
    status: await statusOf(table),
    routeChanged,
    summary: readSummary(parsed.summary[dayTypeOf(table.date)] ?? Object.values(parsed.summary)[0]),
  });
}
