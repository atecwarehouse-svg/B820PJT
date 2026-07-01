"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SignaturePad, { type SignaturePadHandle } from "./SignaturePad";

export interface PledgeSessionInfo {
  id: string;
  manager_name: string;
  operator: string | null;
  location: string | null;
  install_date: string;
}

export interface SignerRow {
  id: number;
  worker_name: string;
  has_after: boolean;
}

type Phase = "before" | "after";

// 작업자용 서명 화면 (본인 휴대폰).
// 설치 전: 이름 입력 + 터치 서명 → 새 행 생성.
// 설치 후: 설치 전에 서명한 본인 이름을 목록에서 선택 + 서명 → 해당 행 갱신.
export default function SafetySign({
  session,
  signers,
  ended,
}: {
  session: PledgeSessionInfo;
  signers: SignerRow[];
  ended: boolean;
}) {
  const router = useRouter();
  const padRef = useRef<SignaturePadHandle>(null);

  const [phase, setPhase] = useState<Phase>("before");
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const pending = signers.filter((s) => !s.has_after); // 설치 후 미완료자

  function switchPhase(p: Phase) {
    setPhase(p);
    setError(null);
    setDone(null);
    setName("");
    setSelectedId(null);
    padRef.current?.clear();
  }

  async function submit() {
    setError(null);
    const signature = padRef.current?.getDataUrl();
    if (!signature) {
      setError("서명을 입력하세요.");
      return;
    }
    if (phase === "before" && !name.trim()) {
      setError("이름을 입력하세요.");
      return;
    }
    if (phase === "after" && selectedId == null) {
      setError("본인 이름을 선택하세요.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/safety/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          phase,
          name: name.trim(),
          signature,
          signatureId: phase === "after" ? selectedId : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "제출 실패");

      const who = phase === "before" ? name.trim() : signers.find((s) => s.id === selectedId)?.worker_name;
      setDone(`${who}님 ${phase === "before" ? "설치 전" : "설치 후"} 서명이 저장되었습니다.`);
      setName("");
      setSelectedId(null);
      padRef.current?.clear();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "제출 실패");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 세션 정보 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-800">
          {session.operator || "운수사"} · {session.install_date}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          안전관리 담당자: {session.manager_name}
          {session.location ? ` · ${session.location}` : ""}
        </p>
      </section>

      {/* 단계 선택 */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => switchPhase("before")}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
            phase === "before" ? "bg-blue-600 text-white" : "border border-gray-300 bg-white text-gray-600"
          }`}
        >
          설치 전 서명
        </button>
        <button
          onClick={() => switchPhase("after")}
          disabled={!ended}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40 ${
            phase === "after" ? "bg-blue-600 text-white" : "border border-gray-300 bg-white text-gray-600"
          }`}
        >
          설치 후 서명{!ended ? " 🔒" : ""}
        </button>
      </div>

      {!ended && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-[11px] text-amber-700">
          설치 후 서명은 안전관리자가 <b>설치 종료</b>한 뒤에 열립니다.
        </p>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        {phase === "before" ? (
          <label className="block">
            <span className="text-[11px] font-medium text-gray-500">이름</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="본인 이름"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
        ) : (
          <div>
            <span className="text-[11px] font-medium text-gray-500">본인 이름 선택 (설치 전 서명자)</span>
            {pending.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-gray-300 p-3 text-center text-xs text-gray-400">
                설치 후 서명이 필요한 작업자가 없습니다. 먼저 &quot;설치 전 서명&quot;을 진행하세요.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {pending.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                      selectedId === s.id
                        ? "bg-blue-600 text-white"
                        : "border border-gray-300 bg-white text-gray-700"
                    }`}
                  >
                    {s.worker_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-3">
          <span className="text-[11px] font-medium text-gray-500">서명</span>
          <div className="mt-1">
            <SignaturePad ref={padRef} />
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        {done && <p className="mt-2 text-xs font-medium text-green-600">{done}</p>}

        <button
          onClick={submit}
          disabled={submitting || (phase === "after" && pending.length === 0)}
          className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "제출 중…" : "서명 제출"}
        </button>
      </section>

      <p className="text-center text-[11px] text-gray-400">
        현재까지 설치 전 {signers.length}명 서명 · 설치 후 {signers.filter((s) => s.has_after).length}명 완료
      </p>
    </div>
  );
}
