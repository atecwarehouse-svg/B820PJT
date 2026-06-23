import { NextRequest, NextResponse } from "next/server";
import { downloadPhoto } from "@/lib/gdrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/photo/[id]  — Drive 파일 ID로 사진 바이트를 받아 그대로 스트리밍.
// 브라우저 표시용. 캐시는 ?t=updated_at 쿼리로 무효화된다.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const fileId = decodeURIComponent(params.id);
  if (!fileId) {
    return NextResponse.json({ error: "파일 ID 누락" }, { status: 400 });
  }

  try {
    const buf = await downloadPhoto(fileId);
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        // 같은 ID는 내용이 바뀔 수 있어 짧게 캐시(쿼리 t로 강제 무효화).
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "사진을 찾을 수 없습니다." }, { status: 404 });
  }
}
