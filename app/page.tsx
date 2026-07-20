import Link from "next/link";
import PlateSearch from "@/components/PlateSearch";
import AdminCallButton from "@/components/AdminCallButton";
import DispatchButton from "@/components/DispatchButton";
import VocModal from "@/components/VocModal";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 pt-10">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-blue-700">B820 설치 사진첩</h1>
        <p className="mt-2 text-sm text-gray-500">
          차량번호를 입력해 사진첩을 작성하세요
        </p>
      </header>
      <PlateSearch />
      <p className="mt-6 text-center text-xs text-gray-400">예) 인천70바4005</p>
      <AdminCallButton />
      <DispatchButton />
      <VocModal />
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
        href="/admin"
        className="mt-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 shadow-sm active:bg-gray-100"
      >
        🔒 관리자
      </Link>
      <Link
        href="/about"
        className="mt-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 shadow-sm active:bg-gray-100"
      >
        ℹ️ 앱 소개
      </Link>
    </main>
  );
}
