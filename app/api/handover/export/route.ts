import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { isAdmin } from "@/lib/admin-auth";
import { currentProject } from "@/lib/project";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { VEHICLE_COLS, getCenters, type HandoverVehicle } from "@/lib/handover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KST = "Asia/Seoul";
const fmtKst = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ko-KR", { timeZone: KST, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    : "";

// GET /api/handover/export — 관리자 쿠키. 전체 차량 현황 xlsx(번호·영업소·센터·노선·차량번호·완료·작업자·완료시각·메모)
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  const project = await currentProject();
  const sb = createServiceClient();
  let vehicles: HandoverVehicle[];
  try {
    vehicles = await fetchAll<HandoverVehicle>((from, to) => sb.from("vehicles").select(VEHICLE_COLS).order("operator").order("route").order("plate").range(from, to));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
  const centers = await getCenters();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("양도양수 현황");
  ws.columns = [
    { header: "번호", key: "no", width: 6 },
    { header: "영업소", key: "operator", width: 26 },
    { header: "센터", key: "center", width: 12 },
    { header: "노선", key: "route", width: 40 },
    { header: "차량번호", key: "plate", width: 14 },
    { header: "완료", key: "done", width: 8 },
    { header: "작업자", key: "by", width: 14 },
    { header: "완료시각", key: "at", width: 18 },
    { header: "메모", key: "note", width: 30 },
  ];
  vehicles.forEach((v, i) =>
    ws.addRow({
      no: i + 1,
      operator: v.operator,
      center: centers[v.operator] ?? "미배정",
      route: v.route,
      plate: v.plate,
      done: v.done_at ? "O" : "",
      by: v.done_by ?? "",
      at: fmtKst(v.done_at),
      note: v.note ?? "",
    }),
  );
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "I1" };

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const ymd = new Date().toLocaleDateString("sv-SE", { timeZone: KST }).replace(/-/g, "");
  const filename = `${project.name}_양도양수현황_${ymd}.xlsx`;
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
