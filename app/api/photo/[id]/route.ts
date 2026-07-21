import { NextRequest, NextResponse } from "next/server";
import { downloadPhoto } from "@/lib/gdrive";

export const runtime = "nodejs";

// GET /api/photo/[id]  — Drive 파일 ID로 사진 바이트를 받아 그대로 스트리밍.
// 사진을 수정하면 '새 파일 ID'가 발급되므로, 같은 ID = 영구히 동일 내용(immutable).
// → public+immutable 장기 캐시로 브라우저/Vercel CDN가 재사용 → 드라이브 재다운로드/쿼터 절감.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const fileId = decodeURIComponent(params.id);
  if (!fileId) {
    return NextResponse.json({ error: "파일 ID 누락" }, { status: 400 });
  }

  // ?download=1&name=파일명 → 첨부로 내려 휴대폰/PC에 파일 저장
  // (아이폰 사파리는 blob+a.download를 무시하므로 서버 attachment 방식 필수 — lib/download.ts 참고)
  const asDownload = req.nextUrl.searchParams.get("download") === "1";
  const name = (req.nextUrl.searchParams.get("name") || "photo").replace(/[\\/:*?"<>|]/g, "_");

  try {
    const buf = await downloadPhoto(fileId);
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        ...(asDownload
          ? {
              "Content-Disposition": `attachment; filename="photo.jpg"; filename*=UTF-8''${encodeURIComponent(name)}.jpg`,
            }
          : {}),
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
