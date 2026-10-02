import { isAdmin } from "@/lib/admin-auth";
import { DEFAULT_SLUG, listProjects } from "@/lib/project";
import AdminLogin from "@/components/AdminLogin";
import ProjectAdmin from "@/components/ProjectAdmin";
import { isLinkShared } from "@/lib/gdrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "프로젝트 관리" };

// 첫 화면 톱니바퀴·'새 프로젝트' 카드가 여는 페이지 — 프로젝트 카드 추가·수정·삭제.
// B820 관리자와 같은 비밀번호(쿠키 30분)로 잠근다.
export default async function ProjectsPage() {
  if (!(await isAdmin(DEFAULT_SLUG))) return <AdminLogin backHref="/" />;
  const projects = await listProjects();
  // 앨범 프로젝트 드라이브 폴더의 링크 공유 여부 (조회 실패 = 비공개로 표시)
  const driveShared: Record<string, boolean> = {};
  await Promise.all(
    projects
      .filter((p) => p.kind === "album" && p.driveFolderId)
      .map(async (p) => {
        driveShared[p.slug] = await isLinkShared(p.driveFolderId as string).catch(() => false);
      }),
  );
  return <ProjectAdmin projects={projects} driveShared={driveShared} />;
}
