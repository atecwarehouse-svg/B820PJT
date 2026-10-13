import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { currentProject } from "@/lib/project";
import { folderLink } from "@/lib/gdrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/drive-folder → 관리자 쿠키가 있으면 현재 프로젝트의 구글드라이브 폴더 링크
// (B820은 env GDRIVE_FOLDER_ID 루트, 그 외는 만들 때 생성한 프로젝트 폴더)
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = await currentProject();
  const id = p.driveFolderId ?? process.env.GDRIVE_FOLDER_ID;
  if (!id) return NextResponse.json({ error: "드라이브 폴더가 설정되지 않았습니다." }, { status: 404 });
  return NextResponse.json({ url: folderLink(id) });
}
