import { NextRequest, NextResponse } from "next/server";
import { loadManyPrintData } from "@/lib/export/load-record";
import { buildMultiDocument } from "@/lib/export/print-html";
import { renderPdf } from "@/lib/export/pdf-render";
import { uploadExport } from "@/lib/gdrive";
import { kstStamp } from "@/lib/export/filename";
import { EXPORT_MAX } from "@/lib/export/limits";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PDF_FOLDER = "인천B820 PDF";

// POST /api/export/pdf  body: { plates: string[], title?: string }
// 선택한 차량들을 차량당 1페이지씩 묶은 PDF 1파일 → 드라이브 "인천B820 PDF" 폴더에 업로드.
export async function POST(req: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const { plates, title } = (await req.json()) as { plates?: string[]; title?: string };
  if (!plates || plates.length === 0) {
    return NextResponse.json({ error: "선택된 차량이 없습니다." }, { status: 400 });
  }
  if (plates.length > EXPORT_MAX) {
    return NextResponse.json(
      { error: `한 번에 최대 ${EXPORT_MAX}대까지 가능합니다.` },
      { status: 400 },
    );
  }

  const items = await loadManyPrintData(plates);
  if (items.length === 0) {
    return NextResponse.json({ error: "유효한 차량이 없습니다." }, { status: 404 });
  }

  try {
    const html = buildMultiDocument(items);
    const pdf = await renderPdf(html);
    const base = (title || "B820_설치사진첩").replace(/[\\/]/g, "-");
    const fileName = `${base}_${items.length}대_${kstStamp()}.pdf`;
    const { link, folderLink } = await uploadExport(PDF_FOLDER, fileName, pdf, "application/pdf");
    return NextResponse.json({ ok: true, folder: PDF_FOLDER, name: fileName, link, folderLink, count: items.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PDF 생성 실패" },
      { status: 500 },
    );
  }
}
