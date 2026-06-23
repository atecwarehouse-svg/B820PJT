import { NextRequest, NextResponse } from "next/server";
import { loadBuildInput } from "@/lib/export/load-xlsx-input";
import { buildWorkbookMulti, type BuildInput } from "@/lib/export/xlsx-builder";
import { uploadExport } from "@/lib/gdrive";
import { kstStamp } from "@/lib/export/filename";
import { EXPORT_MAX } from "@/lib/export/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const XLSX_FOLDER = "인천B820 엑셀";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// POST /api/export/xlsx  body: { plates: string[], title?: string }
// 선택 차량을 묶은 엑셀 1파일 → 드라이브 "인천B820 엑셀" 폴더에 업로드.
export async function POST(req: NextRequest) {
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

  const inputs = (
    await Promise.all(plates.map((p) => loadBuildInput(p.trim())))
  ).filter((x): x is BuildInput => x !== null);

  if (inputs.length === 0) {
    return NextResponse.json({ error: "유효한 차량이 없습니다." }, { status: 404 });
  }

  try {
    const wb = await buildWorkbookMulti(inputs);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const base = (title || "B820_설치사진첩").replace(/[\\/]/g, "-");
    const fileName = `${base}_${inputs.length}대_${kstStamp()}.xlsx`;
    const { link, folderLink } = await uploadExport(XLSX_FOLDER, fileName, buf, XLSX_MIME);
    return NextResponse.json({ ok: true, folder: XLSX_FOLDER, name: fileName, link, folderLink, count: inputs.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "엑셀 생성 실패" },
      { status: 500 },
    );
  }
}
