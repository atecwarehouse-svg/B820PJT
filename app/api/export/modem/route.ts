import { NextResponse } from "next/server";
import { buildModemXlsx } from "@/lib/export/build-modem-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/export/modem — AI텔레콤 'LTE모뎀 사용 현황' 엑셀 다운로드(배차표 팝업 버튼).
export async function GET() {
  try {
    const { buffer, filename } = await buildModemXlsx();
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "양식 생성 실패" },
      { status: 500 },
    );
  }
}
