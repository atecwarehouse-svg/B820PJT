"use client";

import { useState } from "react";

// 대시보드 「구글드라이브 열기」 — 현재 프로젝트 폴더를 새 탭으로. 관리자 비밀번호(프로젝트별) 필요.
// 관리자 쿠키가 살아 있으면 바로 열고, 없으면 비밀번호 팝업 → 로그인(쿠키 발급) → 열기.
export default function DriveOpenButton() {
  const [ask, setAsk] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null); // 팝업 차단 시 수동으로 열 링크

  async function fetchUrl(): Promise<string | null> {
    const res = await fetch("/api/admin/drive-folder", { cache: "no-store" });
    if (res.status === 401) return null;
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error ?? "폴더 링크를 가져오지 못했습니다.");
    return j.url as string;
  }

  function openUrl(u: string) {
    setUrl(u);
    const w = window.open(u, "_blank", "noopener");
    if (w) setAsk(false);
  }

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      const u = await fetchUrl();
      if (u) openUrl(u);
      else {
        setPw("");
        setAsk(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "실패");
      setAsk(true);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "비밀번호가 올바르지 않습니다.");
      }
      const u = await fetchUrl();
      if (!u) throw new Error("권한 확인에 실패했습니다. 다시 시도하세요.");
      openUrl(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors active:bg-emerald-700 disabled:opacity-50"
      >
        📁 {busy && !ask ? "확인 중…" : "구글드라이브 열기"}
      </button>

      {ask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setAsk(false)}>
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl motion-safe:animate-rise"
          >
            <p className="text-base font-bold text-gray-900">📁 구글드라이브 열기</p>
            <p className="mt-1 text-xs text-gray-500">이 프로젝트의 관리자 비밀번호를 입력하세요.</p>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setAsk(false)}
                className="mt-4 block rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white"
              >
                폴더 열기 →
              </a>
            ) : (
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="관리자 비밀번호"
                autoFocus
                className="mt-4 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            )}
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setAsk(false)}
                disabled={busy}
                className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-sm font-medium text-gray-600 active:bg-gray-200 disabled:opacity-50"
              >
                {url ? "닫기" : "취소"}
              </button>
              {!url && (
                <button
                  type="submit"
                  disabled={busy || !pw}
                  className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white active:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? "확인 중…" : "열기"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
