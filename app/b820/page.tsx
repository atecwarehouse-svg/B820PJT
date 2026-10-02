import Link from "@/components/PLink";
import type { Metadata } from "next";
import { currentProject } from "@/lib/project";
import PlateSearch from "@/components/PlateSearch";
import AdminCallButton from "@/components/AdminCallButton";
import DispatchButton from "@/components/DispatchButton";
import VocModal from "@/components/VocModal";
import TeamCallButton from "@/components/TeamCallButton";
import WeatherWidget from "@/components/WeatherWidget";

// 빌드(배포) 시각 KST "26.08.09 22:10" + 커밋 7자리 — 정적 페이지라 빌드 때 값이 박힌다
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? ""; // next.config.mjs 가 빌드 때 박아 둔 KST 시각 (동적 페이지라 모듈 상수로는 못 잡는다)
const COMMIT = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "";

// 프로젝트 홈 — B820은 /b820, 다른 앨범 프로젝트는 /p/<slug> (미들웨어가 이 파일로 rewrite).
// 제목·탭 이름은 현재 프로젝트명.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await currentProject()).name };
}

export default async function HomePage() {
  const project = await currentProject();
  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col px-4 pt-24">
      <WeatherWidget />
      <Link
        href="/"
        className="absolute left-4 top-3 inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm active:bg-blue-700"
      >
        ← 프로젝트 선택
      </Link>
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-blue-700">{project.name}</h1>
        <p className="mt-2 text-sm text-gray-500">
          차량번호를 입력해 사진첩을 작성하세요
        </p>
      </header>
      <PlateSearch />
      <p className="mt-6 text-center text-xs text-gray-400">예) 인천70바4005</p>
      <AdminCallButton />
      <DispatchButton />
      <VocModal />
      <TeamCallButton />
      <Link
        href="/dashboard"
        className="mt-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 shadow-sm active:bg-gray-100"
      >
        📊 진행 현황 (대시보드)
      </Link>
      <Link
        href="/list"
        className="mt-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 shadow-sm active:bg-gray-100"
      >
        📋 저장 목록 / 다운로드
      </Link>
      <Link
        href="/safety"
        className="mt-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 shadow-sm active:bg-gray-100"
      >
        🖊️ 안전관리 서약서
      </Link>
      <Link
        href="/teams"
        className="mt-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 shadow-sm active:bg-gray-100"
      >
        👷 설치팀별 확인
      </Link>
      <Link
        href="/admin"
        className="mt-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 shadow-sm active:bg-gray-100"
      >
        🔒 관리자
      </Link>
      {/* 배포 버전 — 빌드 시점에 고정. 새로고침해서 이 값이 바뀌면 최신판을 받은 것 */}
      <p className="mb-6 mt-4 text-center text-[10px] text-gray-400">
        v{BUILD_TIME}
        {COMMIT && ` · ${COMMIT}`}
      </p>
    </main>
  );
}
