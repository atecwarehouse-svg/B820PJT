import { NextRequest, NextResponse } from "next/server";
import { loadBuildInput } from "@/lib/export/load-xlsx-input";
import { buildWorkbookMulti, type BuildInput } from "@/lib/export/xlsx-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/export/xlsx  body: { plates: string[] }
// 선택한 차량들을 한 시트에 차량별 블록으로 쌓고 차량마다 페이지 분할한 엑셀 1파일.
export async function POST(req: NextRequest) {
  const { plates } = (await req.json()) as { plates?: string[] };
  if (!plates || plates.length === 0) {
    return NextResponse.json({ error: "선택된 차량이 없습니다." }, { status: 400 });
  }

  const inputs = (
    await Promise.all(plates.map((p) => loadBuildInput(p.trim())))
  ).filter((x): x is BuildInput => x !== null);

  if (inputs.length === 0) {
    return NextResponse.json({ error: "유효한 차량이 없습니다." }, { status: 404 });
  }

  const wb = await buildWorkbookMulti(inputs);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  const filename = encodeURIComponent(`B820_설치사진첩_${inputs.length}대.xlsx`);

  return new NextResponse(arrayBuffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
