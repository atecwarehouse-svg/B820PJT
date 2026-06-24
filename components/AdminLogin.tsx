"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// 관리자 비밀번호 입력 게이트. 성공 시 쿠키 발급 후 페이지 새로고침.
export default function AdminLogin() {
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
      <div className="mb-4 text-center">
        <div className="text-3xl">🔒</div>
        <h1 className="mt-2 text-xl font-bold text-blue-700">관리자</h1>
        <p className="mt-1 text-sm text-gray-500">비밀번호를 입력하세요</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          autoFocus
          className="rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "확인 중…" : "입장"}
        </button>
      </form>
      <Link href="/" className="mt-6 text-center text-sm text-blue-600">
        ← 처음으로
      </Link>
    </main>
  );
}
