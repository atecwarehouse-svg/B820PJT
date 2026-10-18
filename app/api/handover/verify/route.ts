import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { isAdmin } from "@/lib/admin-auth";
import { currentSlug, getProject } from "@/lib/project";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { runAfterResponse } from "@/lib/background";
import { sendHandoverVerifyCard } from "@/lib/teams";
import { TERMINAL_RULE, checkTerminal, normPlate, parseTerminalBuffer, type TerminalRow } from "@/lib/import/parse-terminal-xls";
import { getSetting, setSetting } from "@/lib/settings";
import { VEHICLE_COLS, currentWorker, getCenters, workerLabel, type HandoverVehicle } from "@/lib/handover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/handover/verify — 작업자·관리자 쿠키. multipart file = 차량단말기버전 조회(.xls/.xlsx).
//   DB 차량(전 센터) 하나하나를 파일과 대조: ok(5종 충족) · partial(파일엔 있는데 단말기 부족) · missing(파일에 없음) → partial+missing = 미완료.
//   파싱 결과는 app_settings.handover_verify_file 에 저장(최근 1건, 새 업로드가 교체). 응답 뒤 관리자 호출방 팀즈 카드.
//   GET → 저장 파일 기준 재대조(팀즈 카드 없음). GET ?format=xlsx → 엑셀(검증 결과·요약 시트) 첨부.
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

// 최근 업로드 파일(파싱 결과)을 프로젝트 app_settings 에 저장 — 팝업을 다시 열면 재업로드 없이 이 파일 기준으로 현재 DB 와 다시 대조. 새 업로드가 교체.
const VERIFY_FILE_KEY = "handover_verify_file";
interface SavedFile {
  fileName: string;
  at: string;
  by: string;
  rows: TerminalRow[];
}
async function loadSaved(): Promise<SavedFile | null> {
  try {
    const v = JSON.parse((await getSetting(VERIFY_FILE_KEY)) ?? "null") as SavedFile | null;
    if (!v || !Array.isArray(v.rows)) return null;
    // 손상된 행은 버린다(plate 문자열 + ids 배열만)
    v.rows = v.rows.filter((r) => r && typeof r.plate === "string" && r.plate && Array.isArray(r.ids)).map((r) => ({ plate: r.plate, office: String(r.office ?? ""), ids: r.ids.map(String) }));
    return v.rows.length ? v : null;
  } catch {
    return null;
  }
}

async function auth() {
  const worker = await currentWorker();
  if (worker) return workerLabel(worker);
  return (await isAdmin()) ? "관리자" : null;
}

// GET → 저장된 최근 파일로 대조한 결과 { saved: true, ... } / 없으면 { saved: false }. ?format=xlsx 면 엑셀 첨부.
export async function GET(req: NextRequest) {
  if (!(await auth())) return bad("로그인이 필요합니다.", 401);
  const saved = await loadSaved();
  if (!saved) {
    if (req.nextUrl.searchParams.get("format") === "xlsx") return bad("저장된 검증 파일이 없습니다. 먼저 파일을 올려 주세요.", 404);
    return NextResponse.json({ saved: false });
  }
  const r = await compute(saved);
  if ("error" in r) return bad(r.error, 500);
  if (req.nextUrl.searchParams.get("format") === "xlsx") return excel(r, (await getProject(currentSlug()))?.name ?? currentSlug());
  return NextResponse.json({ saved: true, ...r });
}

// POST multipart file → 파싱·저장(교체)·대조·팀즈 카드
export async function POST(req: NextRequest) {
  const who = await auth();
  if (!who) return bad("로그인이 필요합니다.", 401);
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return bad("파일이 없습니다.");

  let rows: TerminalRow[];
  try {
    rows = parseTerminalBuffer(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return bad("파일을 읽을 수 없습니다: " + (e instanceof Error ? e.message : String(e)));
  }
  if (!rows.length) return bad("파일에 차량이 없습니다. 차량단말기버전 조회 파일인지 확인하세요.");
  const saved: SavedFile = { fileName: file.name, at: new Date().toISOString(), by: who, rows };
  try {
    await setSetting(VERIFY_FILE_KEY, JSON.stringify(saved));
  } catch (e) {
    return bad("파일 저장 실패: " + (e instanceof Error ? e.message : String(e)), 500);
  }
  const result = await compute(saved);
  if ("error" in result) return bad(result.error, 500);

  const slug = currentSlug();
  const pending = result.items.filter((i) => i.status !== "ok");
  runAfterResponse(async () => {
    const project = await getProject(slug);
    await sendHandoverVerifyCard({
      projectName: project?.name ?? slug,
      worker: who,
      fileName: file.name,
      overall: result.overall,
      centers: result.centers,
      pending: pending.map((p) => ({ plate: p.plate, center: p.center, route: p.route, reason: p.reason })),
      doneNotVerified: pending.filter((i) => i.done_by).map((i) => i.plate),
    });
  });
  return NextResponse.json({ saved: true, ...result });
}

interface VerifyResult {
  fileName: string;
  fileAt: string;
  fileBy: string;
  fileVehicles: number;
  overall: { total: number; ok: number };
  centers: { label: string; total: number; ok: number }[];
  items: VerifyItem[];
  extra: string[];
  at: string;
}

// 저장 파일 vs 현재 DB 차량 대조
async function compute(saved: SavedFile): Promise<VerifyResult | { error: string }> {
  const inFile = new Map(saved.rows.map((r) => [r.plate, r]));
  const sb = createServiceClient();
  let vehicles: HandoverVehicle[];
  try {
    vehicles = await fetchAll<HandoverVehicle>((from, to) => sb.from("vehicles").select(VEHICLE_COLS).order("operator").order("route").order("plate").range(from, to));
  } catch (e) {
    return { error: "차량 목록 조회 실패: " + (e instanceof Error ? e.message : String(e)) };
  }
  const centers = await getCenters();
  // 영업소명은 업로드 파일(서버) 기준 새 이름으로 — 파일에 없는 차량은 같은 DB 영업소의 다른 차량에서 배운 이름(최빈값), 그것도 없으면 DB 이름
  const learned = new Map<string, Map<string, number>>();
  for (const v of vehicles) {
    const office = inFile.get(normPlate(v.plate))?.office;
    if (!office) continue;
    const cnt = learned.get(v.operator) ?? new Map<string, number>();
    cnt.set(office, (cnt.get(office) ?? 0) + 1);
    learned.set(v.operator, cnt);
  }
  const newName = (dbOperator: string) => [...(learned.get(dbOperator) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? dbOperator;
  const items: VerifyItem[] = vehicles.map((v) => {
    const f = inFile.get(normPlate(v.plate));
    const base = { plate: v.plate, operator: f?.office || newName(v.operator), route: v.route, center: centers[v.operator] ?? "미배정", done_by: v.done_by };
    if (!f) return { ...base, status: "missing", reason: "파일에 없음", counts: TERMINAL_RULE.map(() => 0) };
    const c = checkTerminal(f.ids);
    return c.ok ? { ...base, status: "ok", reason: "", counts: c.counts } : { ...base, status: "partial", reason: c.missing, counts: c.counts };
  });
  const dbPlates = new Set(vehicles.map((v) => normPlate(v.plate)));
  const extra = saved.rows.filter((r) => !dbPlates.has(r.plate)).map((r) => r.plate); // 파일에만 있는 차량(차량 목록에 없음)

  const byCenter = new Map<string, { total: number; ok: number }>();
  for (const it of items) {
    const c = byCenter.get(it.center) ?? { total: 0, ok: 0 };
    c.total++;
    if (it.status === "ok") c.ok++;
    byCenter.set(it.center, c);
  }
  return {
    fileName: saved.fileName,
    fileAt: saved.at,
    fileBy: saved.by,
    fileVehicles: saved.rows.length,
    overall: { total: items.length, ok: items.filter((i) => i.status === "ok").length },
    centers: [...byCenter.entries()].map(([label, c]) => ({ label, ...c })),
    items,
    extra,
    at: new Date().toISOString(),
  };
}

const KST = "Asia/Seoul";
async function excel(r: VerifyResult, projectName: string) {
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
  sm.addRow(["업로드", `${new Date(r.fileAt).toLocaleString("ko-KR", { timeZone: KST })} · ${r.fileBy}`]);
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
