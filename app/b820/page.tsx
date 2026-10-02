import Link from "@/components/PLink";
import type { Metadata } from "next";
import { currentProject } from "@/lib/project";
import PlateSearch from "@/components/PlateSearch";
import AdminCallButton from "@/components/AdminCallButton";
import DispatchButton from "@/components/DispatchButton";
import VocModal from "@/components/VocModal";
import TeamCallButton from "@/components/TeamCallButton";
import WeatherWidget from "@/components/WeatherWidget";
import { CARD_COLORS, PROJECT_ICONS, Svg } from "@/components/ProjectIcon";

// 빌드(배포) 시각 KST "26.08.09 22:10" + 커밋 7자리 — 정적 페이지라 빌드 때 값이 박힌다
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? ""; // next.config.mjs 가 빌드 때 박아 둔 KST 시각 (동적 페이지라 모듈 상수로는 못 잡는다)
const COMMIT = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "";

// 프로젝트 홈 — B820은 /b820, 다른 앨범 프로젝트는 /p/<slug> (미들웨어가 이 파일로 rewrite).
// 제목·탭 이름은 현재 프로젝트명. 위: 프로젝트 아이콘 머리 + 차량번호 검색 카드, 아래: 메뉴 타일 2열.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await currentProject()).name };
}

// 홈 메뉴 타일(링크) — 이모지 배경색은 메뉴마다 다르게
const MENU: { href: string; emoji: string; label: string; tint: string }[] = [
  { href: "/dashboard", emoji: "📊", label: "진행 현황", tint: "bg-indigo-50" },
  { href: "/list", emoji: "📋", label: "저장 목록 · 다운로드", tint: "bg-sky-50" },
  { href: "/safety", emoji: "🖊️", label: "안전관리 서약서", tint: "bg-rose-50" },
  { href: "/teams", emoji: "👷", label: "설치팀별 확인", tint: "bg-amber-50" },
  { href: "/admin", emoji: "🔒", label: "관리자", tint: "bg-gray-100" },
];

export default async function HomePage() {
  const project = await currentProject();
  const icon = PROJECT_ICONS[project.icon];
  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col px-4 pb-10 pt-16">
      <WeatherWidget />
      <Link href="/" className="pill absolute left-4 top-3 text-xs">
        ← 프로젝트 선택
      </Link>

      {/* 머리 — 런처 카드와 같은 색의 아이콘 타일 + 프로젝트명 */}
      <header className="mb-5 flex flex-col items-center text-center motion-safe:animate-rise">
        <span
          className={`mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${CARD_COLORS[project.color].card}`}
        >
          <Svg d={icon.d} className="h-8 w-8" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{project.name}</h1>
        {project.description && <p className="mt-1 text-sm text-gray-500">{project.description}</p>}
      </header>

      {/* 차량번호 검색 카드 */}
      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 motion-safe:animate-rise" style={{ animationDelay: "80ms" }}>
        <p className="mb-2 text-sm font-semibold text-gray-800">🚍 차량번호를 입력해 사진첩을 작성하세요</p>
        <PlateSearch />
        <p className="mt-2 text-xs text-gray-400">예) 인천70바4005</p>
      </section>

      {/* 메뉴 타일 — 관리자 호출은 눈에 띄게 한 줄 전체, 나머지는 2열 */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 motion-safe:animate-rise" style={{ animationDelay: "160ms" }}>
        <AdminCallButton />
        <DispatchButton />
        <VocModal />
        <TeamCallButton />
        {MENU.map((m) => (
          <Link key={m.href} href={m.href} className="home-tile">
            <span className={`emoji ${m.tint}`}>{m.emoji}</span>
            {m.label}
          </Link>
        ))}
      </div>

      {/* 배포 버전 — 빌드 시점에 고정. 새로고침해서 이 값이 바뀌면 최신판을 받은 것 */}
      <p className="mt-6 text-center text-[10px] text-gray-400">
        v{BUILD_TIME}
        {COMMIT && ` · ${COMMIT}`}
      </p>
    </main>
  );
}
