import { isAdmin } from "@/lib/admin-auth";
import { DEFAULT_SLUG, isDefault, listProjects } from "@/lib/project";
import { PROJECT_PERIOD_KEY, SHARED_PASSWORD_KEY, getSetting, parsePeriod } from "@/lib/settings";
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
  // 앨범 프로젝트 기간(빈 양식 전개일정 3행 날짜) — 수정 폼 프리필용
  const periods: Record<string, { start: string; end: string }> = {};
  // 협력업체 공용 비밀번호(진행현황 다운로드·대시보드 상세) — 프로젝트별 설정값, 없으면 "" (= 기본값 사용)
  const sharedPasswords: Record<string, string> = {};
  await Promise.all(
    projects
      .filter((p) => p.kind !== "link") // 앨범·양도양수 — 자기 스키마가 있는 프로젝트
      .map(async (p) => {
        if (p.driveFolderId) driveShared[p.slug] = await isLinkShared(p.driveFolderId).catch(() => false);
        sharedPasswords[p.slug] = (await getSetting(SHARED_PASSWORD_KEY, p.slug)) ?? "";
        if (isDefault(p.slug)) return;
        const period = parsePeriod(await getSetting(PROJECT_PERIOD_KEY, p.slug));
        if (period) periods[p.slug] = period;
      }),
  );
  return <ProjectAdmin projects={projects} driveShared={driveShared} periods={periods} sharedPasswords={sharedPasswords} />;
}
