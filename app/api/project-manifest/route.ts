import { NextResponse } from "next/server";
import { currentProject, currentSlug, isDefault } from "@/lib/project";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 프로젝트별 PWA 매니페스트 — 프로젝트 홈(generateMetadata)이 <link rel="manifest">로 연결한다.
// 공유 링크(/p/<slug>)로 들어온 작업자가 홈 화면에 추가하면 그 프로젝트 홈에서 바로 시작하는 앱이 된다.
//   id·start_url·scope가 프로젝트마다 달라 프로젝트별로 따로 설치된다. 이름·아이콘도 프로젝트 것.
// GET /p/<slug>/api/project-manifest  (B820은 /api/project-manifest → /b820)
export async function GET() {
  const slug = currentSlug();
  const project = await currentProject();
  // start_url은 scope 안에 있어야 설치된다. B820은 다른 화면이 /dashboard 등 접두사 없이 있으므로 scope="/",
  // 다른 프로젝트는 모든 화면이 /p/<slug>/ 아래라 scope를 거기로 좁힌다(프로젝트별 별도 앱).
  const home = isDefault(slug) ? "/b820" : `/p/${slug}/`;
  const scope = isDefault(slug) ? "/" : home;
  // 아이콘은 색·아이콘 키를 쿼리로 넘겨 접두사 없이 그린다(프로젝트 판별 불필요, 브라우저가 Referer 없이 받아도 OK)
  const icon = (size: number) => ({
    src: `/api/project-icon?size=${size}&color=${project.color}&icon=${project.icon}`,
    sizes: `${size}x${size}`,
    type: "image/png",
  });
  const manifest = {
    id: home,
    name: project.name,
    short_name: project.name.length > 12 ? project.name.slice(0, 12) : project.name,
    description: project.description || `${project.name} — ${project.kind === "handover" ? "양도양수 체크리스트" : "설치 사진첩"}`,
    start_url: home,
    scope,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1d4ed8",
    orientation: "portrait",
    lang: "ko",
    icons: [
      { ...icon(192), purpose: "any" },
      { ...icon(512), purpose: "any" },
      { ...icon(512), purpose: "maskable" },
    ],
  };
  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" },
  });
}
