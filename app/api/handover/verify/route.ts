import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { currentSlug, getProject } from "@/lib/project";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { runAfterResponse } from "@/lib/background";
import { sendHandoverVerifyCard } from "@/lib/teams";
import { checkTerminal, normPlate, parseTerminalBuffer } from "@/lib/import/parse-terminal-xls";
import { VEHICLE_COLS, currentWorker, getCenters, workerLabel, type HandoverVehicle } from "@/lib/handover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/handover/verify — 작업자·관리자 쿠키. multipart file = 차량단말기버전 조회(.xls/.xlsx).
//   DB 차량(전 센터) 하나하나를 파일과 대조: ok(5종 충족) · partial(파일엔 있는데 단말기 부족) · missing(파일에 없음) → partial+missing = 미완료.
//   저장하지 않는다(파일이 곧 서버 상태). 응답 뒤 관리자 호출방 팀즈 카드.
export interface VerifyItem {
  plate: string;
  operator: string;
  route: string;
  center: string;
  status: "ok" | "partial" | "missing";
  reason: string; // partial: "56000… 0/1, 1560… 1/3" · missing: "파일에 없음"
  done_by: string | null;
}
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const worker = await currentWorker();
  if (!worker && !(await isAdmin())) return bad("로그인이 필요합니다.", 401);
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return bad("파일이 없습니다.");

  let rows;
  try {
    rows = parseTerminalBuffer(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return bad("파일을 읽을 수 없습니다: " + (e instanceof Error ? e.message : String(e)));
  }
  const inFile = new Map(rows.map((r) => [r.plate, r.ids]));

  const sb = createServiceClient();
  let vehicles: HandoverVehicle[];
  try {
    vehicles = await fetchAll<HandoverVehicle>((from, to) => sb.from("vehicles").select(VEHICLE_COLS).order("operator").order("route").order("plate").range(from, to));
  } catch (e) {
    return bad("차량 목록 조회 실패: " + (e instanceof Error ? e.message : String(e)), 500);
  }
  const centers = await getCenters();
  const items: VerifyItem[] = vehicles.map((v) => {
    const ids = inFile.get(normPlate(v.plate));
    const base = { plate: v.plate, operator: v.operator, route: v.route, center: centers[v.operator] ?? "미배정", done_by: v.done_by };
    if (!ids) return { ...base, status: "missing", reason: "파일에 없음" };
    const c = checkTerminal(ids);
    return c.ok ? { ...base, status: "ok", reason: "" } : { ...base, status: "partial", reason: c.missing };
  });
  const dbPlates = new Set(vehicles.map((v) => normPlate(v.plate)));
  const extra = rows.filter((r) => !dbPlates.has(r.plate)).map((r) => r.plate); // 파일에만 있는 차량(차량 목록에 없음)

  const byCenter = new Map<string, { total: number; ok: number }>();
  for (const it of items) {
    const c = byCenter.get(it.center) ?? { total: 0, ok: 0 };
    c.total++;
    if (it.status === "ok") c.ok++;
    byCenter.set(it.center, c);
  }
  const overall = { total: items.length, ok: items.filter((i) => i.status === "ok").length };
  const pending = items.filter((i) => i.status !== "ok");
  const doneNotVerified = pending.filter((i) => i.done_by).map((i) => i.plate);
  const result = {
    fileName: file.name,
    fileVehicles: rows.length,
    overall,
    centers: [...byCenter.entries()].map(([label, c]) => ({ label, ...c })),
    items,
    extra,
    at: new Date().toISOString(),
  };

  const slug = currentSlug();
  const who = worker ? workerLabel(worker) : "관리자";
  runAfterResponse(async () => {
    const project = await getProject(slug);
    await sendHandoverVerifyCard({
      projectName: project?.name ?? slug,
      worker: who,
      fileName: file.name,
      overall,
      centers: result.centers,
      pending: pending.map((p) => ({ plate: p.plate, center: p.center, reason: p.reason })),
      doneNotVerified,
    });
  });
  return NextResponse.json(result);
}
