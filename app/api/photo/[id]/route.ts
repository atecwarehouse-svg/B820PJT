import { NextRequest, NextResponse } from "next/server";
import { downloadPhoto } from "@/lib/gdrive";

export const runtime = "nodejs";

// GET /api/photo/[id]  — Drive 파일 ID로 사진 바이트를 받아 그대로 스트리밍.
// 사진을 수정하면 '새 파일 ID'가 발급되므로, 같은 ID = 영구히 동일 내용(immutable).
// → public+immutable 장기 캐시로 브라우저/Vercel CDN가 재사용 → 드라이브 재다운로드/쿼터 절감.
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
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    // 실패 응답은 캐시하지 않음
    return NextResponse.json(
      { error: "사진을 찾을 수 없습니다." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
}
