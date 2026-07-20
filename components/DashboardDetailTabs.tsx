"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

// 대시보드 상세 섹션(설치 일정 / 운수사별 / 영업소별 / 날짜별 검색)을 탭으로 묶고,
// 비밀번호(진행현황 다운로드와 동일)로 잠금 해제해야 보이게 한다.
// 잠겨 있을 땐 서버가 내용 자체를 내려주지 않는다(children이 없음).
const TABS = [
  { key: "schedule", label: "설치 일정" },
  { key: "operator", label: "운수사별 진행 현황" },
  { key: "branch", label: "영업소별" },
  { key: "date", label: "날짜별 검색" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function DashboardDetailTabs({
  unlocked,
  schedule,
  operator,
  branch,
  date,
}: {
  unlocked: boolean;
  schedule?: ReactNode;
  operator?: ReactNode;
  branch?: ReactNode;
  date?: ReactNode;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("schedule");
  const [asking, setAsking] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/progress/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "비밀번호가 올바르지 않습니다.");
      }
      setPw("");
      setAsking(false);
      router.refresh(); // 서버가 잠금 해제 상태로 상세 내용을 내려준다
    } catch (e) {
      setError(e instanceof Error ? e.message : "잠금 해제 실패");
    } finally {
      setBusy(false);
    }
  }

  async function lockAgain() {
    await fetch("/api/progress/unlock", { method: "DELETE" });
    router.refresh();
  }

  if (!unlocked) {
    return (
      <section className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
        <div className="text-2xl">🔒</div>
        <p className="mt-2 text-sm font-bold text-gray-700">
          설치 일정 · 운수사별 · 영업소별 · 날짜별 검색
        </p>
        <p className="mt-1 text-xs text-gray-400">
          비밀번호를 입력하면 상세 현황을 볼 수 있습니다.
        </p>

        {asking ? (
          <form onSubmit={unlock} className="mx-auto mt-4 flex max-w-xs flex-col gap-2">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="비밀번호"
              autoFocus
              className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || !pw}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white active:bg-blue-700 disabled:opacity-50"
              >
                {busy ? "확인 중…" : "확인"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAsking(false);
                  setError(null);
                  setPw("");
                }}
                className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 active:bg-gray-100"
              >
                취소
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm active:bg-blue-700"
          >
            🔓 잠금 해제
          </button>
        )}
      </section>
    );
  }

  const content: Record<TabKey, ReactNode> = { schedule, operator, branch, date };

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-2">
        {/* 탭 — 모바일에서 4개가 넘치면 가로 스크롤 */}
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                tab === t.key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 active:bg-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={lockAgain}
          className="shrink-0 text-xs font-medium text-gray-400 active:text-gray-600"
        >
          🔒 잠그기
        </button>
      </div>

      <div className="mt-3">{content[tab]}</div>
    </section>
  );
}
