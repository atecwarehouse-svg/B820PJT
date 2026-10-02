"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/PLink";

// 관리자 비밀번호 입력 게이트. 성공 시 쿠키 발급 후 페이지 새로고침.
// backHref: 로그인 화면의 "처음으로" 링크 — 관리자 페이지는 B820 홈, 프로젝트 관리는 첫 화면
export default function AdminLogin({ backHref = "/b820" }: { backHref?: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "로그인 실패");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 motion-safe:animate-rise">
      <div className="mb-4 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-2xl shadow-lg shadow-blue-200">🔒</span>
        <h1 className="mt-3 text-xl font-bold text-gray-900">관리자</h1>
        <p className="mt-1 text-sm text-gray-500">비밀번호를 입력하세요</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          autoFocus
          className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-200 active:scale-[.98] disabled:opacity-50 disabled:shadow-none"
        >
          {busy ? "확인 중…" : "입장"}
        </button>
      </form>
      </div>
      <Link href={backHref} className="pill mx-auto mt-6">
        ← 처음으로
      </Link>
    </main>
  );
}
