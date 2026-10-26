import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { currentSlug, getProject } from "@/lib/project";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { runAfterResponse } from "@/lib/background";
import { sendHandoverDoneCard } from "@/lib/teams";
import {
  VEHICLE_COLS,
  centerOffices,
  currentWorker,
  getCenters,
  webhookFor,
  workerLabel,
  type HandoverVehicle,
} from "@/lib/handover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 양도양수 체크리스트 데이터 — 작업자 쿠키(hw_<slug>) 또는 관리자 쿠키 필수.
//   GET  → { worker, center, offices, vehicles[], at }  작업자는 자기 센터 차량만, 관리자(작업자 로그인 없이)는 전체 + centers
//        ?all=1 → 작업자도 전체 센터 차량 + centers(현황표 보기용, 읽기 전용)
//   POST { plate, done?: boolean, note?: string } → 완료/해제·메모 저장(부분 update) → { vehicle }
//        작업자는 자기 센터 차량만 바꿀 수 있다. done_by 는 "직급 이름"(관리자는 "관리자").
//   내 센터 차량 = osupdate: vehicles.center = 내 센터 / handover: 영업소→센터 맵에서 내 센터의 영업소들
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function who() {
  const worker = await currentWorker();
  if (worker) return { worker, admin: false as const };
  if (await isAdmin()) return { worker: null, admin: true as const };
  return null;
}

type Scope = { center: string } | { offices: string[] } | null; // null = 전체
const scopeOf = (osupdate: boolean, center: string, centers: Awaited<ReturnType<typeof getCenters>>): Scope =>
  osupdate ? { center } : { offices: centerOffices(centers, center) };
// supabase 빌더 제네릭이 깊어(TS2589) 최소 인터페이스로 캐스팅 — 필터 두 종류(eq/in)만 쓴다
type Filterable = { eq: (c: string, v: string) => unknown; in: (c: string, v: string[]) => unknown };
const applyScope = <Q>(q: Q, s: Scope): Q =>
  (!s ? q : "center" in s ? (q as unknown as Filterable).eq("center", s.center) : (q as unknown as Filterable).in("operator", s.offices)) as Q;

export async function GET(req: NextRequest) {
  const me = await who();
  if (!me) return bad("로그인이 필요합니다.", 401);
  const all = req.nextUrl.searchParams.get("all") === "1";
  const sb = createServiceClient();
  const [centers, project] = await Promise.all([getCenters(), getProject(currentSlug())]);
  const osupdate = project?.kind === "osupdate";
  const scope = me.worker && !all ? scopeOf(osupdate, me.worker.center, centers) : null;
  const offices = scope && "offices" in scope ? scope.offices : null;
  if (offices && !offices.length) {
    return NextResponse.json({ worker: me.worker, center: me.worker!.center, offices: [], vehicles: [], at: new Date().toISOString() });
  }
  let vehicles: HandoverVehicle[];
  try {
    vehicles = await fetchAll<HandoverVehicle>((from, to) =>
      applyScope(sb.from("vehicles").select(VEHICLE_COLS), scope).order("route").order("plate").range(from, to),
    );
  } catch (e) {
    return bad("차량 목록을 불러오지 못했습니다: " + (e instanceof Error ? e.message : String(e)), 500);
  }
  return NextResponse.json({
    worker: me.worker,
    center: me.worker?.center ?? null,
    offices,
    vehicles,
    ...(me.admin || all ? { centers } : {}),
    at: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const me = await who();
  if (!me) return bad("로그인이 필요합니다.", 401);
  const body = (await req.json().catch(() => null)) as { plate?: unknown; done?: unknown; note?: unknown } | null;
  const plate = String(body?.plate ?? "").trim();
  if (!plate) return bad("차량번호가 필요합니다.");
  if (body?.done === undefined && body?.note === undefined) return bad("바꿀 내용이 없습니다.");
  if (body?.done !== undefined && typeof body.done !== "boolean") return bad("done 은 true/false 여야 합니다.");
  if (body?.note !== undefined && typeof body.note !== "string") return bad("note 형식이 잘못되었습니다.");
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 200) : undefined;

  const sb = createServiceClient();
  const slug = currentSlug();
  const [{ data: v, error: vErr }, centers, project] = await Promise.all([
    sb.from("vehicles").select(VEHICLE_COLS).eq("plate", plate).maybeSingle(),
    getCenters(slug),
    getProject(slug),
  ]);
  const osupdate = project?.kind === "osupdate";
  if (vErr) return bad(vErr.message, 500);
  if (!v) return bad("해당 차량이 없습니다.", 404);
  if (me.worker) {
    const mine = osupdate ? (v as HandoverVehicle).center === me.worker.center : centerOffices(centers, me.worker.center).includes((v as HandoverVehicle).operator);
    if (!mine) return bad("내 센터 차량이 아닙니다.", 404);
  }

  const patch: Record<string, unknown> = {};
  if (body?.done === true) {
    patch.done_at = new Date().toISOString();
    patch.done_by = me.worker ? workerLabel(me.worker) : "관리자";
  } else if (body?.done === false) {
    patch.done_at = null;
    patch.done_by = null;
  }
  if (note !== undefined) patch.note = note || null;

  const { data, error } = await sb.from("vehicles").update(patch).eq("plate", plate).select(VEHICLE_COLS).single();
  if (error) return bad("저장 실패: " + error.message, 500);

  // 완료 체크 → 팀즈 카드(프로젝트 웹훅, 없으면 관리자 호출방 — 완료 차량 + 센터·전체 완료/잔여/진척율, OS업데이트는 시내/마을별도).
  // 응답 뒤 백그라운드, 실패해도 체크는 유지.
  if (body?.done === true) {
    const v2 = data as HandoverVehicle;
    const centerName = v2.center ?? centers[v2.operator] ?? me.worker?.center ?? "미배정";
    const scope: Scope = osupdate ? { center: centerName } : { offices: centerOffices(centers, centerName).length ? centerOffices(centers, centerName) : [v2.operator] };
    runAfterResponse(async () => {
      // osupdate: 센터 전용 방이라 프로젝트 전체 줄은 뺀다(각 센터는 자기 진척만). handover 는 전체 줄 유지.
      const [webhook, centerProg, overall] = await Promise.all([webhookFor(centerName, slug), progress(sb, scope), osupdate ? null : progress(sb, null)]);
      const byType = osupdate
        ? await Promise.all(["시내버스", "마을버스"].map(async (t) => ({ label: t, ...(await progress(sb, scope, t)) })))
        : undefined;
      await sendHandoverDoneCard({
        projectName: project?.name ?? slug,
        kindLabel: osupdate ? "OS업데이트 적용" : undefined,
        webhook,
        plate: v2.plate,
        operator: v2.operator,
        operatorLabel: osupdate ? "운수사" : undefined,
        route: v2.route,
        busType: osupdate ? v2.bus_type : undefined,
        model: osupdate ? v2.model : undefined,
        worker: String(patch.done_by),
        note: v2.note,
        center: { label: centerName, ...centerProg },
        byType: byType?.filter((p) => p.total > 0),
        overall: overall ? { label: "전체", ...overall } : undefined,
      });
    });
  }
  return NextResponse.json({ vehicle: data });
}

// 완료/전체 대수 — scope 가 null 이면 프로젝트 전체, busType 이 있으면 그 구분만
async function progress(sb: ReturnType<typeof createServiceClient>, scope: Scope, busType?: string): Promise<{ total: number; done: number }> {
  const q = (done: boolean) => {
    let x = applyScope(sb.from("vehicles").select("plate", { count: "exact", head: true }), scope);
    if (busType) x = x.eq("bus_type", busType);
    if (done) x = x.not("done_at", "is", null);
    return x;
  };
  const [{ count: total }, { count: done }] = await Promise.all([q(false), q(true)]);
  return { total: total ?? 0, done: done ?? 0 };
}
