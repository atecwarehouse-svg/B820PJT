import { NextRequest, NextResponse } from "next/server";
import { loadBuildInput } from "@/lib/export/load-xlsx-input";
import { buildWorkbook } from "@/lib/export/xlsx-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { plate: string } },
) {
  const plate = decodeURIComponent(params.plate).trim();
  const input = await loadBuildInput(plate);
  if (!input) {
    return NextResponse.json({ error: "차량을 찾을 수 없습니다." }, { status: 404 });
  }

  const wb = await buildWorkbook(input);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  const filename = encodeURIComponent(`B820_설치사진첩_${plate}.xlsx`);

  return new NextResponse(arrayBuffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
