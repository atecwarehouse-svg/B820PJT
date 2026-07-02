import { NextResponse } from "next/server";
import { buildProgressXlsx } from "@/lib/export/build-progress-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/export/progress?date=<YYYY-MM-DD>
// 완료(저장)된 차량을 양식 차량리스트에 채운 xlsx 다운로드.
// date(기준일)를 주면 그 날짜 시점의 스냅샷(누적계획·기준일·완료분)으로 내려준다.
// 없으면 현재 업무일 기준.
export async function GET(req: Request) {
  const dateRaw = new URL(req.url).searchParams.get("date");
  const asOfDate =
    dateRaw != null && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw.trim())
      ? dateRaw.trim()
      : undefined;

  let buffer: Buffer;
  let filename: string;
  try {
    const r = await buildProgressXlsx({ asOfDate });
    buffer = r.buffer;
    filename = r.filename;
    console.log(`[export/progress] 기준일 ${asOfDate ?? "오늘"} · 기존 ${r.filled}대 채움, 증차 ${r.added}대 추가`);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "양식 생성 실패" },
      { status: 500 },
    );
  }

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
