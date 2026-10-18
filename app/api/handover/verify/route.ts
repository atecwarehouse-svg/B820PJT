import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { isAdmin } from "@/lib/admin-auth";
import { currentSlug, getProject } from "@/lib/project";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { runAfterResponse } from "@/lib/background";
import { sendHandoverVerifyCard } from "@/lib/teams";
import { TERMINAL_RULE, checkTerminal, normPlate, parseTerminalBuffer } from "@/lib/import/parse-terminal-xls";
import { VEHICLE_COLS, currentWorker, getCenters, workerLabel, type HandoverVehicle } from "@/lib/handover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/handover/verify — 작업자·관리자 쿠키. multipart file = 차량단말기버전 조회(.xls/.xlsx).
//   DB 차량(전 센터) 하나하나를 파일과 대조: ok(5종 충족) · partial(파일엔 있는데 단말기 부족) · missing(파일에 없음) → partial+missing = 미완료.
//   저장하지 않는다(파일이 곧 서버 상태). 응답 뒤 관리자 호출방 팀즈 카드.
//   ?format=xlsx → 같은 대조 결과를 엑셀(검증 결과·요약 시트) 첨부로 응답(팀즈 카드 없음).
export interface VerifyItem {
  plate: string;
  operator: string;
  route: string;
  center: string;
  status: "ok" | "partial" | "missing";
  reason: string; // partial: "56000… 0/1, 1560… 1/3" · missing: "파일에 없음"
  counts: number[]; // TERMINAL_RULE 순서(55000·56000·1560) 개수
  done_by: string | null;
}
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const worker = await currentWorker();
  if (!worker && !(await isAdmin())) return bad("로그인이 필요합니다.", 401);
  const xlsx = req.nextUrl.searchParams.get("format") === "xlsx";
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
    if (!ids) return { ...base, status: "missing", reason: "파일에 없음", counts: TERMINAL_RULE.map(() => 0) };
    const c = checkTerminal(ids);
    return c.ok ? { ...base, status: "ok", reason: "", counts: c.counts } : { ...base, status: "partial", reason: c.missing, counts: c.counts };
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
  if (xlsx) return excel(result, (await getProject(slug))?.name ?? slug);

  const who = worker ? workerLabel(worker) : "관리자";
  runAfterResponse(async () => {
    const project = await getProject(slug);
    await sendHandoverVerifyCard({
      projectName: project?.name ?? slug,
      worker: who,
      fileName: file.name,
      overall,
      centers: result.centers,
      pending: pending.map((p) => ({ plate: p.plate, center: p.center, route: p.route, reason: p.reason })),
      doneNotVerified,
    });
  });
  return NextResponse.json(result);
}

const KST = "Asia/Seoul";
async function excel(r: { fileName: string; fileVehicles: number; overall: { total: number; ok: number }; centers: { label: string; total: number; ok: number }[]; items: VerifyItem[]; extra: string[] }, projectName: string) {
  const pct = (ok: number, t: number) => (t ? Math.round((ok / t) * 100) : 0);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("검증 결과");
  ws.columns = [
    { header: "번호", key: "no", width: 6 },
    { header: "센터", key: "center", width: 12 },
    { header: "영업소", key: "operator", width: 26 },
    { header: "노선", key: "route", width: 40 },
    { header: "차량번호", key: "plate", width: 14 },
    { header: "검증", key: "status", width: 10 },
    { header: "사유", key: "reason", width: 22 },
    ...TERMINAL_RULE.map((t, i) => ({ header: `${t.prefix}…(${t.need})`, key: `c${i}`, width: 11 })),
    { header: "체크리스트 완료", key: "done_by", width: 16 },
  ];
  // 센터 → 노선 → 차량번호 순(팝업·팀즈 카드와 같은 묶음)
  const short = (x: string) => x.replace(/\(.*$/, "").trim();
  const sorted = [...r.items].sort((a, b) => a.center.localeCompare(b.center, "ko") || short(a.route).localeCompare(short(b.route), "ko") || a.plate.localeCompare(b.plate, "ko"));
  sorted.forEach((it, i) =>
    ws.addRow({
      no: i + 1,
      center: it.center,
      operator: it.operator,
      route: it.route,
      plate: it.plate,
      status: it.status === "ok" ? "등록 확인" : "미완료",
      reason: it.reason,
      ...Object.fromEntries(it.counts.map((c, k) => [`c${k}`, c])),
      done_by: it.done_by ?? "",
    }),
  );
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + ws.columns.length)}1` };
  ws.eachRow((row, n) => {
    if (n > 1 && row.getCell("status").value === "미완료") row.getCell("status").font = { color: { argb: "FFDC2626" }, bold: true };
  });

  const sm = wb.addWorksheet("요약");
  sm.columns = [{ width: 16 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 10 }];
  sm.addRow(["파일", r.fileName]);
  sm.addRow(["파일 차량", r.fileVehicles]);
  sm.addRow(["검증 시각", new Date().toLocaleString("ko-KR", { timeZone: KST })]);
  sm.addRow([]);
  sm.addRow(["구분", "전체", "등록 확인", "미완료", "진척율"]).font = { bold: true };
  sm.addRow(["전체", r.overall.total, r.overall.ok, r.overall.total - r.overall.ok, `${pct(r.overall.ok, r.overall.total)}%`]);
  for (const c of r.centers) sm.addRow([c.label, c.total, c.ok, c.total - c.ok, `${pct(c.ok, c.total)}%`]);
  if (r.extra.length) {
    sm.addRow([]);
    sm.addRow(["파일에만 있는 차량", r.extra.join(", ")]);
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const ymd = new Date().toLocaleDateString("sv-SE", { timeZone: KST }).replace(/-/g, "");
  const filename = `${projectName}_서버등록검증_${ymd}.xlsx`;
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
