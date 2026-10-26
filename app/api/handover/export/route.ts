import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { isAdmin } from "@/lib/admin-auth";
import { currentProject } from "@/lib/project";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { VEHICLE_COLS, currentWorker, getCenters, vehicleCenter, type HandoverVehicle } from "@/lib/handover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KST = "Asia/Seoul";
const fmtKst = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ko-KR", { timeZone: KST, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    : "";
const ymdKst = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("sv-SE", { timeZone: KST }) : "");

// GET /api/handover/export — 관리자 또는 작업자 쿠키.
//   handover: 전체 차량 현황 xlsx(번호·영업소·센터·노선·차량번호·완료·작업자·완료시각·메모)
//   osupdate: 업로드 양식(전체센터_차량.xlsx) 그대로 — A센터·B차량번호·C기종·D운수사·E노선·F완료여부("완료")·G완료일·H특이사항 + I작업자. 그대로 다시 올릴 수 있다
//   ?done=1 → 완료 차량만(완료시각순)
export async function GET(req: NextRequest) {
  if (!(await currentWorker()) && !(await isAdmin())) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const doneOnly = req.nextUrl.searchParams.get("done") === "1";
  const project = await currentProject();
  const osupdate = project.kind === "osupdate";
  const sb = createServiceClient();
  let vehicles: HandoverVehicle[];
  try {
    vehicles = await fetchAll<HandoverVehicle>((from, to) => {
      const q = sb.from("vehicles").select(VEHICLE_COLS);
      return (doneOnly ? q.not("done_at", "is", null).order("done_at") : q.order("center").order("operator").order("route")).order("plate").range(from, to);
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
  const centers = await getCenters();

  const wb = new ExcelJS.Workbook();
  let ws: ExcelJS.Worksheet;
  if (osupdate) {
    ws = wb.addWorksheet(doneOnly ? "완료 차량" : "OS적용리스트");
    ws.columns = [
      { header: "센터", key: "center", width: 12 },
      { header: "차량(번호/운영수량)", key: "plate", width: 18 },
      { header: "기종", key: "model", width: 20 },
      { header: "운수사", key: "operator", width: 26 },
      { header: "노선", key: "route", width: 40 },
      { header: "완료여부", key: "done", width: 10 },
      { header: "완료일", key: "at", width: 12 },
      { header: "특이사항", key: "note", width: 30 },
      { header: "작업자", key: "by", width: 14 },
    ];
    for (const v of vehicles) {
      ws.addRow({
        center: v.center ?? vehicleCenter(v, centers),
        plate: v.plate,
        model: v.model ?? "",
        operator: v.operator,
        route: v.route,
        done: v.done_at ? "완료" : "",
        at: ymdKst(v.done_at),
        note: v.note ?? "",
        by: v.done_by ?? "",
      });
    }
  } else {
    ws = wb.addWorksheet(doneOnly ? "완료 차량" : "양도양수 현황");
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
        center: vehicleCenter(v, centers),
        route: v.route,
        plate: v.plate,
        done: v.done_at ? "O" : "",
        by: v.done_by ?? "",
        at: fmtKst(v.done_at),
        note: v.note ?? "",
      }),
    );
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + ws.columns.length)}1` };

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const ymd = new Date().toLocaleDateString("sv-SE", { timeZone: KST }).replace(/-/g, "");
  const filename = `${project.name}_${doneOnly ? "완료차량" : osupdate ? "OS적용리스트" : "양도양수현황"}_${ymd}.xlsx`;
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
