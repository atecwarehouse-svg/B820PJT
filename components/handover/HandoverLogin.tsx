"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Worker {
  center: string;
  rank: string;
  name: string;
}

// 양도양수 작업자 로그인 — 센터 → 이름(관리자가 등록한 명단) → 직원 비밀번호. 성공하면 쿠키가 생기고 홈이 체크리스트로 바뀐다.
// 마지막에 고른 센터·이름은 이 기기에 기억(localStorage)해 다음엔 비밀번호만 치면 되게.
export default function HandoverLogin() {
  const router = useRouter();
  const [centers, setCenters] = useState<string[] | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [center, setCenter] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/handover/login", { cache: "no-store" });
        const j = (await res.json()) as { centers: string[]; workers: Worker[] };
        setCenters(j.centers ?? []);
        setWorkers(j.workers ?? []);
        try {
          const last = JSON.parse(localStorage.getItem("handoverWorker") ?? "null") as { center?: string; name?: string } | null;
          if (last?.center && (j.centers ?? []).includes(last.center)) {
            setCenter(last.center);
            if (last.name && (j.workers ?? []).some((w) => w.center === last.center && w.name === last.name)) setName(last.name);
          }
        } catch {
          /* 저장값 없음 */
        }
      } catch {
        setCenters([]);
        setError("명단을 불러오지 못했습니다. 새로고침해 주세요.");
      }
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/handover/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, center, name }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "로그인 실패");
      try {
        localStorage.setItem("handoverWorker", JSON.stringify({ center, name }));
      } catch {
        /* 사생활 모드 등 */
      }
      setEntering(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인 실패");
      setBusy(false);
    }
  }

  const names = workers.filter((w) => w.center === center);
  const btn = (on: boolean) =>
    `rounded-xl px-3 py-3 text-sm font-semibold ring-1 transition-colors ${on ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-gray-700 ring-black/5 active:bg-blue-50"}`;

  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 motion-safe:animate-rise">
      <p className="text-sm font-semibold text-gray-800">👤 본인을 선택하세요</p>
      <p className="mt-0.5 text-xs text-gray-400">센터 → 이름을 고르고 직원 비밀번호를 입력하면 내 센터 차량 목록이 열립니다.</p>

      {centers === null ? (
        <p className="py-8 text-center text-sm text-gray-400">명단 불러오는 중…</p>
      ) : centers.length === 0 ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-800">
          등록된 작업자가 없습니다. 관리자가 「관리자 → 작업자」에서 센터·직급·이름을 먼저 등록해야 합니다.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-bold text-gray-500">1. 소속 센터</p>
            <div className="grid grid-cols-2 gap-2">
              {centers.map((c) => (
                <button key={c} type="button" onClick={() => { setCenter(c); setName(""); }} className={btn(center === c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          {center && (
            <div>
              <p className="mb-1.5 text-xs font-bold text-gray-500">2. 이름</p>
              {names.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-3 py-3 text-xs text-gray-500">이 센터에 등록된 작업자가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {names.map((w) => (
                    <button key={w.name} type="button" onClick={() => setName(w.name)} className={btn(name === w.name)}>
                      {w.rank && <span className={`mr-1 text-[11px] ${name === w.name ? "text-blue-100" : "text-gray-400"}`}>{w.rank}</span>}
                      {w.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {name && (
            <div>
              <p className="mb-1.5 text-xs font-bold text-gray-500">3. 직원 비밀번호</p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="직원 비밀번호"
                autoFocus
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base outline-none transition-colors focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={busy || !center || !name || !password}
            className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-200 active:scale-[.98] disabled:opacity-40 disabled:shadow-none"
          >
            {busy ? "확인 중…" : "체크리스트 열기"}
          </button>
        </form>
      )}
      {(busy || entering) && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-sm motion-safe:animate-fade-in">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm font-semibold text-blue-700">{entering ? "체크리스트 여는 중…" : "비밀번호 확인 중…"}</p>
        </div>
      )}
    </section>
  );
}
