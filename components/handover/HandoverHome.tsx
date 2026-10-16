import Link from "@/components/PLink";
import ShareInstallBar from "@/components/ShareInstallBar";
import { CARD_COLORS, PROJECT_ICONS, Svg } from "@/components/ProjectIcon";
import type { Project } from "@/lib/project";
import type { Worker } from "@/lib/handover";
import HandoverLogin from "./HandoverLogin";
import HandoverChecklist from "./HandoverChecklist";

// 양도양수 체크리스트 프로젝트 홈(서버) — 로그인 전엔 센터·이름 선택+직원 비밀번호, 로그인 후엔 내 센터 차량 체크리스트.
export default function HandoverHome({ project, worker, version }: { project: Project; worker: Worker | null; version: string }) {
  const icon = PROJECT_ICONS[project.icon];
  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col px-4 pb-10 pt-16">
      <Link href="/" className="pill absolute left-4 top-3 text-xs">
        ← 프로젝트 선택
      </Link>
      <ShareInstallBar projectName={project.name} kindLabel="양도양수 체크리스트" />

      <header className="mb-4 flex flex-col items-center text-center motion-safe:animate-rise">
        <span className={`mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${CARD_COLORS[project.color].card}`}>
          <Svg d={icon.d} className="h-7 w-7" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{project.name}</h1>
        <p className="mt-1 text-sm text-gray-500">{project.description || "양도양수 체크리스트"}</p>
      </header>

      {worker ? <HandoverChecklist worker={worker} /> : <HandoverLogin />}

      <div className="mt-8 flex flex-col items-center gap-2">
        <Link href="/admin" className="pill-muted text-xs">
          🔒 관리자
        </Link>
        <p className="text-[10px] text-gray-400">{version}</p>
      </div>
    </main>
  );
}
