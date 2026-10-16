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
  workerLabel,
  type HandoverVehicle,
} from "@/lib/handover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 양도양수 체크리스트 데이터 — 작업자 쿠키(hw_<slug>) 또는 관리자 쿠키 필수.
//   GET  → { worker, center, offices, vehicles[], at }  작업자는 자기 센터 영업소 차량만, 관리자(작업자 로그인 없이)는 전체 + centers
//   POST { plate, done?: boolean, note?: string } → 완료/해제·메모 저장(부분 update) → { vehicle }
//        작업자는 자기 센터 차량만 바꿀 수 있다. done_by 는 "직급 이름"(관리자는 "관리자").
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function who() {
  const worker = await currentWorker();
  if (worker) return { worker, admin: false as const };
  if (await isAdmin()) return { worker: null, admin: true as const };
  return null;
}

export async function GET() {
  const me = await who();
  if (!me) return bad("로그인이 필요합니다.", 401);
  const sb = createServiceClient();
  const centers = await getCenters();
  const offices = me.worker ? centerOffices(centers, me.worker.center) : null;
  if (offices && !offices.length) {
    return NextResponse.json({ worker: me.worker, center: me.worker!.center, offices: [], vehicles: [], at: new Date().toISOString() });
  }
  let vehicles: HandoverVehicle[];
  try {
    vehicles = await fetchAll<HandoverVehicle>((from, to) => {
      let q = sb.from("vehicles").select(VEHICLE_COLS).order("route").order("plate").range(from, to);
      if (offices) q = q.in("operator", offices);
      return q;
    });
  } catch (e) {
    return bad("차량 목록을 불러오지 못했습니다: " + (e instanceof Error ? e.message : String(e)), 500);
  }
  return NextResponse.json({
    worker: me.worker,
    center: me.worker?.center ?? null,
    offices,
    vehicles,
    ...(me.admin ? { centers } : {}),
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
  const { data: v, error: vErr } = await sb.from("vehicles").select(VEHICLE_COLS).eq("plate", plate).maybeSingle();
  if (vErr) return bad(vErr.message, 500);
  if (!v) return bad("해당 차량이 없습니다.", 404);
  if (me.worker) {
    const offices = centerOffices(await getCenters(), me.worker.center);
    if (!offices.includes((v as HandoverVehicle).operator)) return bad("내 센터 차량이 아닙니다.", 404);
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

  // 완료 체크 → 관리자 호출방 카드(완료 차량 + 센터·전체 완료/잔여/진척율). 응답 뒤 백그라운드, 실패해도 체크는 유지.
  if (body?.done === true) {
    const v2 = data as HandoverVehicle;
    const slug = currentSlug();
    const centers = await getCenters(slug);
    const centerName = centers[v2.operator] ?? me.worker?.center ?? "미배정";
    const offices = centerOffices(centers, centerName);
    runAfterResponse(async () => {
      const [project, centerProg, overall] = await Promise.all([
        getProject(slug),
        progress(sb, offices.length ? offices : [v2.operator]),
        progress(sb, null),
      ]);
      await sendHandoverDoneCard({
        projectName: project?.name ?? slug,
        plate: v2.plate,
        operator: v2.operator,
        route: v2.route,
        worker: String(patch.done_by),
        note: v2.note,
        center: { label: centerName, ...centerProg },
        overall: { label: "전체", ...overall },
      });
    });
  }
  return NextResponse.json({ vehicle: data });
}

// 완료/전체 대수 — offices 가 null 이면 프로젝트 전체
async function progress(sb: ReturnType<typeof createServiceClient>, offices: string[] | null): Promise<{ total: number; done: number }> {
  const q = (done: boolean) => {
    let x = sb.from("vehicles").select("plate", { count: "exact", head: true });
    if (offices) x = x.in("operator", offices);
    if (done) x = x.not("done_at", "is", null);
    return x;
  };
  const [{ count: total }, { count: done }] = await Promise.all([q(false), q(true)]);
  return { total: total ?? 0, done: done ?? 0 };
}
