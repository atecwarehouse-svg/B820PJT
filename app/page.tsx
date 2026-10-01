import Link from "next/link";
import { getProjects } from "@/lib/settings";
import ProjectManager from "@/components/ProjectManager";
import { CARD_COLORS, PROJECT_ICONS, Svg, UI, type ColorKey } from "@/components/ProjectIcon";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "프로젝트 선택 — 산출물 관리",
};

// 정사각형 색 카드 — 색은 CARD_COLORS 키(등록 시 선택), 글씨·아이콘은 흰색
const card = (color: ColorKey) =>
  `group flex aspect-square flex-col items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-br p-3 text-center text-white shadow-lg transition-transform duration-150 active:scale-[.97] ${CARD_COLORS[color].card}`;
const tile =
  "flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 transition-transform duration-200 group-active:scale-110";

// 첫 화면 — 프로젝트 선택. B820은 이 앱 자체(/b820)라 고정 카드,
// 그 외 프로젝트는 관리자가 등록한 앱 주소로 이동하는 카드.
// 카드는 위에서부터 순서대로 떠오르고(animate-rise + 지연), 누르면 살짝 눌린다.
export default async function ProjectSelectPage() {
  const projects = await getProjects();
  const rise = (i: number) => ({ animationDelay: `${100 + i * 70}ms` });

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-blue-50 via-gray-100 to-gray-100">
      {/* 배경 장식 — 은은하게 숨쉬는 빛 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-blue-300/30 blur-3xl motion-safe:animate-pulse"
      />

      <div className="relative mx-auto max-w-md px-4 pb-16 pt-14">
        {/* 우측 상단 톱니바퀴 → 관리자 페이지 (누르면 90도 돈다) */}
        <Link
          href="/admin"
          aria-label="관리자 페이지"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-gray-500 shadow-sm ring-1 ring-black/5 backdrop-blur transition-transform duration-300 active:rotate-90 active:text-blue-600 motion-safe:animate-fade-in"
        >
          <Svg d={UI.gear} className="h-5 w-5" />
        </Link>

        <header className="mb-8 flex flex-col items-center text-center motion-safe:animate-rise">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-200">
            <Svg d={UI.grid} className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">산출물 관리</h1>
          <p className="mt-1.5 text-sm text-gray-500">작업할 프로젝트를 선택하세요</p>
        </header>

        <ul className="grid grid-cols-2 gap-3">
          <li className="motion-safe:animate-rise" style={rise(0)}>
            <Link href="/b820" className={card("blue")}>
              <span className={tile}>
                <Svg d={PROJECT_ICONS.bus.d} className="h-9 w-9" />
              </span>
              <span className="block text-sm font-bold leading-snug">B820 설치 사진첩</span>
              <span className="block text-[11px] leading-snug text-white/75">인천버스 단말기 설치</span>
            </Link>
          </li>

          {projects.map((p, i) => (
            <li key={p.id} className="motion-safe:animate-rise" style={rise(i + 1)}>
              <a href={p.url} className={card(p.color)}>
                <span className={tile}>
                  <Svg d={PROJECT_ICONS[p.icon].d} className="h-9 w-9" />
                </span>
                <span className="line-clamp-2 block text-sm font-bold leading-snug">{p.name}</span>
                {p.description && (
                  <span className="line-clamp-2 block text-[11px] leading-snug text-white/75">
                    {p.description}
                  </span>
                )}
              </a>
            </li>
          ))}

          {/* 등장 애니메이션은 카드 버튼에만 — li에 transform이 걸리면 그 안의 fixed 시트가
              화면이 아니라 li 기준으로 붙어 버린다 */}
          <li>
            <ProjectManager projects={projects} riseStyle={rise(projects.length + 1)} />
          </li>
        </ul>
      </div>
    </main>
  );
}
