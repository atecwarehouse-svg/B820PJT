import { NextRequest, NextResponse } from "next/server";
import { loadPrintData } from "@/lib/export/load-record";
import { buildPrintDocument } from "@/lib/export/print-html";
import { renderPdf } from "@/lib/export/pdf-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel: chromium 렌더 여유

export async function GET(
  _req: NextRequest,
  { params }: { params: { plate: string } },
) {
  const plate = decodeURIComponent(params.plate).trim();

  const data = await loadPrintData(plate);
  if (!data) {
    return NextResponse.json({ error: "차량을 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const html = buildPrintDocument(data);
    const pdf = await renderPdf(html);
    const filename = encodeURIComponent(`B820_설치사진첩_${plate}.pdf`);
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PDF 생성 실패" },
      { status: 500 },
    );
  }
}
