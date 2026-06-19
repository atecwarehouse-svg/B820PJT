import { NextRequest, NextResponse } from "next/server";
import { loadManyPrintData } from "@/lib/export/load-record";
import { buildMultiDocument } from "@/lib/export/print-html";
import { renderPdf } from "@/lib/export/pdf-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/export/pdf  body: { plates: string[] }
// 선택한 차량들을 차량당 1페이지씩 묶은 PDF 1파일.
export async function POST(req: NextRequest) {
  const { plates } = (await req.json()) as { plates?: string[] };
  if (!plates || plates.length === 0) {
    return NextResponse.json({ error: "선택된 차량이 없습니다." }, { status: 400 });
  }

  const items = await loadManyPrintData(plates);
  if (items.length === 0) {
    return NextResponse.json({ error: "유효한 차량이 없습니다." }, { status: 404 });
  }

  try {
    const html = buildMultiDocument(items);
    const pdf = await renderPdf(html);
    const filename = encodeURIComponent(`B820_설치사진첩_${items.length}대.pdf`);
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
