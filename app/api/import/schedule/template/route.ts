import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { parsePeriod } from "@/lib/settings";
import { addGuideSheet, type GuideRow } from "@/lib/import/guide-sheet";
import { RAW_DATA_COLS } from "@/components/RawDataGuide";
import { buildV2Workbook, exampleVehicle } from "@/lib/export/v2-form";
import { serialFromYmd } from "@/lib/import/vehicle-columns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/import/schedule/template?name=<프로젝트명>&start=YYYY-MM-DD&end=YYYY-MM-DD → 새 프로젝트 빈 양식(xlsx).
//   마스터 양식(lib/export/templates/v2-master.xlsx)에 예시 차량 1대(차량번호 "예)…"는 업로드 파서가 건너뜀)를 넣어 만든다.
//   시트: 설치 진행현황·설치 전개일정·설치 일자별 현황(+숨김 실사 3종)·차량리스트 — 집계는 전부 차량리스트 수식이라
//   사용자는 차량리스트만 채우면 된다. 제목은 "(프로젝트명) 설치 진행현황", 기준일 K1=TODAY().
//   맨 앞 「작성 안내」 시트는 업로드 때 lib/import/guide-sheet removeGuideSheet로 빠진다.
//   이 파일을 채워 올리면 차량리스트가 이 프로젝트의 진행현황 원본으로 저장되고, 다운로드 때 같은 양식으로 다시 생성된다.

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXAMPLE_DATE = "2026-10-15";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const projectName = (q.get("name") ?? "").trim().slice(0, 40) || "(프로젝트명)";
  const period = parsePeriod({ start: q.get("start"), end: q.get("end") }); // 잘못되면 null
  const exampleDate = period?.start ?? EXAMPLE_DATE;
  const buf = await buildV2Workbook({ name: projectName, period, vehicles: [exampleVehicle(serialFromYmd(exampleDate))] });
  const zip = await JSZip.loadAsync(buf);
  await addGuideSheet(zip, guideRows(projectName, period), [10, 16, 9, 60]);
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const filename = `${projectName} 진행현황_빈양식.xlsx`;
  return new NextResponse(new Uint8Array(out), {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="raw_template.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "X-Template-Full": "1",
    },
  });
}

/** 「작성 안내」 시트 내용 — 긴 문장은 A열에 쓰고 오른쪽 빈 칸으로 넘쳐 보이게(병합하면 줄 높이가 안 맞음) */
function guideRows(projectName: string, period: { start: string; end: string } | null): GuideRow[] {
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const line = (text: string, s: GuideRow["s"] = "body"): GuideRow => ({ s, cells: [text] });
  const gap: GuideRow = { cells: [] };
  return [
    line(`${projectName} 진행현황 양식 — 작성 안내`, "title"),
    line(`내려받은 날: ${today}${period ? ` · 프로젝트 기간: ${period.start} ~ ${period.end}` : ""} · 이 시트는 업로드할 때 자동으로 빠지니 지우지 않아도 됩니다.`, "note"),
    gap,
    line("■ 작성 순서", "head"),
    line("1. 「차량리스트」 시트 2행부터 차량 한 대를 한 줄씩 적습니다. 어느 열에 무엇을 넣는지는 아래 표를 보세요."),
    line("2. 2행의 예시(○○교통 / 예) 인천70바4005)는 지우지 않아도 됩니다. 차량번호가 「예)」로 시작하는 줄은 업로드 때 건너뜁니다."),
    line("3. 「설치 진행현황」·「설치 전개일정」·「설치 일자별 현황」 시트는 손대지 않아도 됩니다. 전부 차량리스트를 보는 수식이라 차량리스트를 채우면 바로 따라 바뀝니다."),
    line("     · 설치 대상(J열)이 「대상」인 차량만 집계합니다. 「제외」·「말소」로 적은 차량은 리스트에 남지만 대상·계획에서 빠집니다."),
    line("     · 운수사 행과 날짜 열은 앱에서 진행현황을 다운로드할 때 차량리스트의 운수사·설치 예정일 수만큼 자동으로 늘어납니다."),
    line("4. 저장한 뒤 「프로젝트 만들기」 화면에 첨부하거나, 대시보드의 「최초 업로드」로 올립니다."),
    line("     · 그 뒤로 일정이 바뀌면 같은 파일의 차량리스트를 고쳐 「설치일정 변경 업로드」로 올리면 됩니다."),
    line("5. 시트 이름(차량리스트)과 1행 제목은 바꾸지 마세요. 열 순서는 제목으로 찾으니 바뀌어도 됩니다."),
    gap,
    line("■ 차량리스트 열 안내", "head"),
    { s: "th", cells: ["열", "내용", "구분", "설명"] },
    ...RAW_DATA_COLS.map((c) => ({ cells: [c.col, c.name, c.need, c.note] })),
    { cells: ["L · M", "설치 완료여부·완료일", "비워 둠", "앱이 설치 완료 때 채우는 칸입니다. 적지 마세요."] },
    { cells: ["G · H · I", "실사 예정일·완료여부·완료일", "선택", "현장실사를 했으면 적습니다. 숨겨진 「실사 …」 시트 3개가 이 열로 집계됩니다."] },
    gap,
    line("■ 참고", "head"),
    line("· 「설치 진행현황」 K1 기준일은 엑셀을 여는 날짜(TODAY)입니다. 앱에서 진행현황을 다운로드하면 고른 날짜로 바뀝니다."),
    line("· 설치 예정일이 같은 차량이 그 날의 계획 수량이 됩니다. 예정일이 비어 있으면 대상에는 들어가지만 날짜별 계획에는 빠집니다."),
    line("· 표에 없는 열(제조사·차대번호 등)은 앱이 읽지 않지만 리스트에 그대로 보존됩니다. 메모용으로 써도 됩니다."),
    line("· 같은 차량번호가 여러 줄이면 마지막 줄만 반영됩니다. 차량리스트에서 지운 차량은 업로드 때 앱에서도 지워집니다(설치 기록이 있는 차량은 보호)."),
  ];
}
