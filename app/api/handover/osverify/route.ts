import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { isAdmin } from "@/lib/admin-auth";
import { currentSlug, getProject } from "@/lib/project";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { runAfterResponse } from "@/lib/background";
import { sendOsVerifyCenterCard, sendOsVerifySummaryCard, type OsVerifyStat } from "@/lib/teams";
import { getSetting, setSetting } from "@/lib/settings";
import { VEHICLE_COLS, currentWorker, getCenters, getWebhook, getWebhooks, vehicleCenter, workerLabel, type HandoverVehicle } from "@/lib/handover";
import { OS_FILE_LABEL, OS_FILE_TYPES, osTypeOfModel, parseOsFile, type OsFileType, type OsRow } from "@/lib/import/parse-osverify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// OS업데이트 적용 검증(osupdate 프로젝트) — 차량마다 5가지를 차량번호 기준으로 대조:
//   ① 웹 체크리스트 완료(done_at) ② 자산등록(단말기장애목록 .xls) ③~⑤ 기종별 OS버전(B710·B700·B800 조회 .xls 중 그 차량 기종 파일)
//   POST multipart { type: fault|b710|b700|b800, file } (작업자·관리자) → 파싱 결과를 app_settings.osverify_<type> 에 저장(최근 1건, 교체) → 전체 대조(발송 없음)
//   POST ?send=1 → 저장된 파일 전부로 최종 취합 → 팀즈: 센터 카드(그 센터 수치만)는 그 센터 웹훅(없으면 기본→env), 전체 취합 카드는 관리자 호출방(env)에만.
//   GET → 저장된 파일들로 현재 DB 와 대조 { files, overall, centers, items }. ?format=xlsx → 차량별 엑셀.
export interface OsItem {
  plate: string;
  center: string;
  operator: string;
  route: string;
  model: string;
  osType: OsFileType | null;
  web: boolean;
  asset: boolean;
  os: boolean;
  osInfo: string; // "AFC 17/17 · BMS 17/17" | "조회 없음" | "파일 없음" | "기종 불명"
  all: boolean;
  mismatch: boolean; // 웹 완료 · OS 정상인데 자산등록만 안 됨(초기엔 미완료가 많아 이것만 목록으로 보여 준다)
  done_by: string | null;
}
interface SavedFile {
  fileName: string;
  at: string;
  by: string;
  rows: OsRow[];
}
const KEY = (t: OsFileType) => `osverify_${t}`;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function loadSaved(t: OsFileType): Promise<SavedFile | null> {
  try {
    const v = JSON.parse((await getSetting(KEY(t))) ?? "null") as SavedFile | null;
    if (!v || !Array.isArray(v.rows)) return null;
    v.rows = v.rows.filter((r) => r && typeof r.plate === "string" && r.plate).map((r) => ({ plate: r.plate, ok: !!r.ok, info: String(r.info ?? "") }));
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

export async function GET(req: NextRequest) {
  if (!(await auth())) return bad("로그인이 필요합니다.", 401);
  const r = await compute();
  if ("error" in r) return bad(r.error, 500);
  // ?format=xlsx → 전체 검증 결과 / ?format=xlsx&only=mismatch → 이상 차량(웹 완료·OS 정상·자산등록 없음)만
  if (req.nextUrl.searchParams.get("format") === "xlsx") {
    return excel(r, (await getProject(currentSlug()))?.name ?? currentSlug(), req.nextUrl.searchParams.get("only") === "mismatch");
  }
  return NextResponse.json(r);
}

// POST ?send=1 (본문 없음) → 저장된 파일 전부로 최종 취합해 팀즈 발송. POST multipart {type,file} → 파일 저장만(발송 없음).
export async function POST(req: NextRequest) {
  const who = await auth();
  if (!who) return bad("로그인이 필요합니다.", 401);
  if (req.nextUrl.searchParams.get("send") === "1") return send(who);

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const type = String(form.get("type") ?? "") as OsFileType;
  if (!OS_FILE_TYPES.includes(type)) return bad("type 은 fault·b710·b700·b800 중 하나여야 합니다.");
  if (!file) return bad("파일이 없습니다.");
  let rows: OsRow[];
  try {
    rows = parseOsFile(Buffer.from(await file.arrayBuffer()), type);
  } catch (e) {
    return bad("파일을 읽을 수 없습니다: " + (e instanceof Error ? e.message : String(e)));
  }
  const saved: SavedFile = { fileName: file.name, at: new Date().toISOString(), by: who, rows };
  try {
    await setSetting(KEY(type), JSON.stringify(saved));
  } catch (e) {
    return bad("파일 저장 실패: " + (e instanceof Error ? e.message : String(e)), 500);
  }
  const result = await compute();
  if ("error" in result) return bad(result.error, 500);
  return NextResponse.json(result);
}

// 최종 취합 발송 — 건바이건이 아니라 파일을 다 올린 뒤 「검증 발송」 버튼으로 한 번에.
async function send(who: string) {
  const result = await compute();
  if ("error" in result) return bad(result.error, 500);
  if (!result.files.some((f) => f.saved)) return bad("올린 파일이 없습니다. 장애목록·OS버전 파일을 먼저 올려 주세요.");

  const slug = currentSlug();
  runAfterResponse(async () => {
    const [project, hooks, base] = await Promise.all([getProject(slug), getWebhooks(slug), getWebhook(slug)]);
    const common = {
      projectName: project?.name ?? slug,
      worker: who,
      files: result.files.map((f) => `${f.label} ${f.saved ? `✓ ${fmtAt(f.at!)} (${f.vehicles}대 중 충족 ${f.ok})` : "✗ 없음"}`),
    };
    const mismatches = (center?: string) =>
      result.items.filter((i) => i.mismatch && (!center || i.center === center)).map((i) => ({ center: i.center, operator: i.operator, plate: i.plate }));
    // 센터 카드 → 그 센터 방(없으면 기본 → env). 미배정은 건너뜀
    for (const c of result.centers) {
      if (c.label === "미배정") continue;
      const webhook = hooks[c.label] ?? base ?? process.env.TEAMS_ADMIN_CALL_WEBHOOK_URL;
      if (!webhook) continue;
      await sendOsVerifyCenterCard({ ...common, webhook, center: c, mismatches: mismatches(c.label) }).catch((e) => console.error("[osverify] center card", c.label, e));
    }
    // 전체 취합 → 관리자 호출방만
    await sendOsVerifySummaryCard({ ...common, overall: result.overall, centers: result.centers.filter((c) => c.label !== "미배정"), mismatches: mismatches() });
  });
  return NextResponse.json({ ...result, sent: true });
}

const KST = "Asia/Seoul";
const fmtAt = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString("sv-SE", { timeZone: KST });
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))} ${d.toLocaleTimeString("ko-KR", { timeZone: KST, hour: "2-digit", minute: "2-digit", hour12: false })}`;
};

export interface OsVerifyResult {
  files: { type: OsFileType; label: string; saved: boolean; fileName?: string; at?: string; by?: string; vehicles?: number; ok?: number }[];
  overall: OsVerifyStat;
  centers: OsVerifyStat[];
  items: OsItem[];
  at: string;
}

async function compute(): Promise<OsVerifyResult | { error: string }> {
  const sb = createServiceClient();
  let vehicles: HandoverVehicle[];
  try {
    vehicles = await fetchAll<HandoverVehicle>((from, to) => sb.from("vehicles").select(VEHICLE_COLS).order("center").order("operator").order("plate").range(from, to));
  } catch (e) {
    return { error: "차량 목록 조회 실패: " + (e instanceof Error ? e.message : String(e)) };
  }
  const [centers, ...saved] = await Promise.all([getCenters(), ...OS_FILE_TYPES.map((t) => loadSaved(t))]);
  const files = OS_FILE_TYPES.map((t, i) => {
    const s = saved[i];
    return s
      ? { type: t, label: OS_FILE_LABEL[t], saved: true, fileName: s.fileName, at: s.at, by: s.by, vehicles: s.rows.length, ok: s.rows.filter((r) => r.ok).length }
      : { type: t, label: OS_FILE_LABEL[t], saved: false };
  });
  const maps = Object.fromEntries(OS_FILE_TYPES.map((t, i) => [t, new Map((saved[i]?.rows ?? []).map((r) => [r.plate, r]))])) as Record<OsFileType, Map<string, OsRow>>;
  const hasFile = Object.fromEntries(OS_FILE_TYPES.map((t, i) => [t, !!saved[i]])) as Record<OsFileType, boolean>;

  const items: OsItem[] = vehicles.map((v) => {
    const plate = v.plate.replace(/\s+/g, "");
    const web = !!v.done_at;
    const asset = !!maps.fault.get(plate)?.ok;
    const osType = osTypeOfModel(v.model);
    let os = false;
    let osInfo = "기종 불명";
    if (osType) {
      if (!hasFile[osType]) osInfo = "파일 없음";
      else {
        const r = maps[osType].get(plate);
        os = !!r?.ok;
        osInfo = r ? r.info : "조회 없음";
      }
    }
    return { plate: v.plate, center: vehicleCenter(v, centers), operator: v.operator, route: v.route, model: v.model ?? "", osType, web, asset, os, osInfo, all: web && asset && os, mismatch: web && os && !asset, done_by: v.done_by };
  });
  const stat = (label: string, xs: OsItem[]): OsVerifyStat => ({
    label,
    total: xs.length,
    web: xs.filter((i) => i.web).length,
    asset: xs.filter((i) => i.asset).length,
    os: xs.filter((i) => i.os).length,
    all: xs.filter((i) => i.all).length,
    mismatch: xs.filter((i) => i.mismatch).length,
  });
  const byCenter = new Map<string, OsItem[]>();
  for (const i of items) byCenter.set(i.center, [...(byCenter.get(i.center) ?? []), i]);
  return {
    files,
    overall: stat("전체", items),
    centers: [...byCenter.entries()].sort(([a], [b]) => a.localeCompare(b, "ko")).map(([c, xs]) => stat(c, xs)),
    items,
    at: new Date().toISOString(),
  };
}

async function excel(r: OsVerifyResult, projectName: string, mismatchOnly = false) {
  const wb = new ExcelJS.Workbook();
  if (mismatchOnly) {
    // 이상 차량만 — 센터→운수사→차량 순, 바로 조치용
    const ws = wb.addWorksheet("자산등록 누락");
    ws.columns = [
      { header: "센터", key: "center", width: 12 },
      { header: "운수사", key: "operator", width: 24 },
      { header: "노선", key: "route", width: 30 },
      { header: "차량번호", key: "plate", width: 14 },
      { header: "기종", key: "model", width: 18 },
      { header: "OS 상세", key: "osInfo", width: 26 },
      { header: "웹 완료자", key: "by", width: 14 },
      { header: "상태", key: "status", width: 30 },
    ];
    for (const i of r.items.filter((x) => x.mismatch)) {
      ws.addRow({ center: i.center, operator: i.operator, route: i.route, plate: i.plate, model: i.model, osInfo: i.osInfo, by: i.done_by ?? "", status: "웹 완료 · OS 정상 · 자산등록(장애목록) 없음" });
    }
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: "H1" };
    return xlsxResponse(wb, `${projectName}_자산등록누락_${new Date().toLocaleDateString("sv-SE", { timeZone: KST }).replace(/-/g, "")}.xlsx`);
  }
  const ws = wb.addWorksheet("검증 결과");
  ws.columns = [
    { header: "센터", key: "center", width: 12 },
    { header: "운수사", key: "operator", width: 24 },
    { header: "노선", key: "route", width: 30 },
    { header: "차량번호", key: "plate", width: 14 },
    { header: "기종", key: "model", width: 18 },
    { header: "웹 완료", key: "web", width: 9 },
    { header: "자산등록", key: "asset", width: 9 },
    { header: "OS 적용", key: "os", width: 9 },
    { header: "OS 상세", key: "osInfo", width: 26 },
    { header: "전부 완료", key: "all", width: 9 },
    { header: "자산등록 누락(웹·OS 완료)", key: "mismatch", width: 12 },
    { header: "완료자", key: "by", width: 14 },
  ];
  const o = (b: boolean) => (b ? "O" : "");
  for (const i of r.items) {
    ws.addRow({ center: i.center, operator: i.operator, route: i.route, plate: i.plate, model: i.model, web: o(i.web), asset: o(i.asset), os: o(i.os), osInfo: i.osInfo, all: o(i.all), mismatch: o(i.mismatch), by: i.done_by ?? "" });
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "L1" };
  const sum = wb.addWorksheet("요약");
  sum.columns = [
    { header: "구분", key: "label", width: 12 },
    { header: "전체", key: "total", width: 8 },
    { header: "웹 완료", key: "web", width: 9 },
    { header: "자산등록", key: "asset", width: 9 },
    { header: "OS 적용", key: "os", width: 9 },
    { header: "전부 완료", key: "all", width: 9 },
    { header: "자산 누락", key: "mismatch", width: 9 },
    { header: "진척율", key: "pct", width: 8 },
  ];
  for (const s of [r.overall, ...r.centers]) sum.addRow({ ...s, pct: s.total ? `${Math.round((s.all / s.total) * 100)}%` : "" });
  sum.addRow({});
  for (const f of r.files) sum.addRow({ label: f.label, total: f.saved ? `${f.fileName} (${f.vehicles}대, 충족 ${f.ok}대, ${fmtAt(f.at!)} ${f.by})` : "파일 없음" });
  sum.getRow(1).font = { bold: true };
  const ymd = new Date().toLocaleDateString("sv-SE", { timeZone: KST }).replace(/-/g, "");
  return xlsxResponse(wb, `${projectName}_OS적용검증_${ymd}.xlsx`);
}

async function xlsxResponse(wb: ExcelJS.Workbook, filename: string) {
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
