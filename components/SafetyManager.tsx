"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { downloadUrl } from "@/lib/download";
import { workDateString } from "@/lib/work-day";
import SignaturePad, { type SignaturePadHandle } from "./SignaturePad";

export interface PledgeSessionRow {
  id: string;
  manager_name: string;
  operator: string | null;
  location: string | null;
  install_date: string;
  signer_count: number;
  ended: boolean;
  end_time: string | null;
}

// 안전관리자용 화면: 세션(공유 링크) 생성 + 기존 세션 목록/다운로드.
export default function SafetyManager({ sessions }: { sessions: PledgeSessionRow[] }) {
  const router = useRouter();
  const sigRef = useRef<SignaturePadHandle>(null);
  // 설치일자 기본값은 업무일(20:00~익일 12:00) 기준 — 자정 넘어 링크를 만들어도 작업 시작일로 잡힌다.
  const today = workDateString(new Date());

  const [manager, setManager] = useState("");
  const [operator, setOperator] = useState("");
  const [location, setLocation] = useState("");
  const [installDate, setInstallDate] = useState(today);
  const [quantity, setQuantity] = useState("");
  const [startTime, setStartTime] = useState("");

  const [creating, setCreating] = useState(false);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null); // 복사된 링크 키 (`세션id:단계`)

  // 설치 전/후 서명 링크 — 같은 세션이라 서명 취합·PDF는 함께 된다.
  function signLink(id: string, phase: "before" | "after") {
    return `${window.location.origin}/safety/${id}${phase === "after" ? "?phase=after" : ""}`;
  }

  async function create() {
    if (!manager.trim()) {
      setError("안전관리자 이름을 입력하세요.");
      return;
    }
    const managerSig = sigRef.current?.getDataUrl();
    if (!managerSig) {
      setError("안전관리자 서명을 입력하세요.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/safety/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manager_name: manager,
          manager_sig: managerSig,
          operator,
          location,
          install_date: installDate,
          quantity,
          start_time: startTime,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "생성 실패");
      setCreatedId(json.id);
      setCopied(null);
      sigRef.current?.clear();
      router.refresh(); // 목록 갱신
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(link: string, key: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // 클립보드 실패 시 프롬프트로 대체
      window.prompt("링크를 복사하세요", link);
    }
  }

  async function endInstall(id: string) {
    // 이 화면은 관리자 비밀번호로 잠겨 있어 별도 입력 없이 확인만 받는다.
    const ok = window.confirm(
      "설치를 종료할까요?\n종료 후부터 작업자가 '설치 후' 서명을 할 수 있습니다.",
    );
    if (!ok) return;
    setEndingId(id);
    try {
      const res = await fetch("/api/safety/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "설치 종료 실패");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "설치 종료 실패");
    } finally {
      setEndingId(null);
    }
  }

  async function deleteSession(s: PledgeSessionRow) {
    const ok = window.confirm(
      `서약서를 삭제할까요?\n(${s.operator || "운수사 미지정"} · ${s.install_date} · 서명 ${s.signer_count}명 — 되돌릴 수 없음)`,
    );
    if (!ok) return;
    setDeletingId(s.id);
    try {
      const res = await fetch("/api/safety/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: s.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "삭제 실패");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeletingId(null);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      {/* 세션 생성 폼 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-blue-700">새 서약서 링크 만들기</h2>
        <p className="mt-1 text-xs text-gray-500">
          설치일자·장소·운수사·본인 이름을 입력하면 작업자용 서명 링크가 생성됩니다.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="col-span-2 block">
            <span className="text-[11px] font-medium text-gray-500">안전관리자 이름 *</span>
            <input value={manager} onChange={(e) => setManager(e.target.value)} className={inputCls} placeholder="홍길동" />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-gray-500">운수사명</span>
            <input value={operator} onChange={(e) => setOperator(e.target.value)} className={inputCls} placeholder="○○운수" />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-gray-500">장소</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} placeholder="○○차고지" />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-gray-500">설치일자</span>
            <input type="date" value={installDate} onChange={(e) => setInstallDate(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-gray-500">수량</span>
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputCls} placeholder="예: 10대" />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-gray-500">설치 시작시간</span>
            <input value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} placeholder="예: 09:00" />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          ※ 종료시간은 아래 목록에서 <b>설치 종료</b>를 누를 때 자동 기록되며, 그때부터 작업자가 설치 후 서명을 할 수 있습니다.
        </p>

        <div className="mt-3">
          <span className="text-[11px] font-medium text-gray-500">
            안전관리자 서명 <span className="text-red-500">*</span>
          </span>
          <div className="mt-1">
            <SignaturePad ref={sigRef} height={140} />
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <button
          onClick={create}
          disabled={creating}
          className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
        >
          {creating ? "생성 중…" : "링크 생성"}
        </button>

        {createdId && (
          <div className="mt-3 space-y-2">
            {(["before", "after"] as const).map((p) => {
              const link = signLink(createdId, p);
              const key = `${createdId}:${p}`;
              return (
                <div key={p} className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <p className="text-[11px] font-medium text-blue-700">
                    {p === "before" ? "설치 전" : "설치 후"} 서명 링크
                  </p>
                  <p className="mt-1 break-all text-xs text-gray-700">{link}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => copyLink(link, key)}
                      className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white active:bg-blue-700"
                    >
                      {copied === key ? "복사됨 ✓" : "링크 복사"}
                    </button>
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener"
                      className="flex-1 rounded-lg border border-blue-300 bg-white px-3 py-2 text-center text-xs font-semibold text-blue-700 active:bg-blue-100"
                    >
                      열어보기
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 기존 세션 목록 */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-gray-700">생성된 서약서 목록</h2>
        {sessions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-xs text-gray-400">
            아직 생성된 서약서가 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800">
                      {s.operator || "운수사 미지정"} · {s.install_date}
                      {s.ended ? (
                        <span className="ml-1 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 align-middle">
                          종료 {s.end_time ?? ""}
                        </span>
                      ) : (
                        <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 align-middle">
                          진행중
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      담당: {s.manager_name} · 서명 {s.signer_count}명
                      {s.location ? ` · ${s.location}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => downloadUrl(`/api/export/safety?session=${s.id}`)}
                    className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white active:bg-green-700"
                  >
                    PDF
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => copyLink(signLink(s.id, "before"), `${s.id}:before`)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 active:bg-gray-100"
                  >
                    {copied === `${s.id}:before` ? "복사됨 ✓" : "설치 전 링크 복사"}
                  </button>
                  <button
                    onClick={() => copyLink(signLink(s.id, "after"), `${s.id}:after`)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 active:bg-gray-100"
                  >
                    {copied === `${s.id}:after` ? "복사됨 ✓" : "설치 후 링크 복사"}
                  </button>
                </div>
                <div className="mt-2 flex gap-2">
                  {!s.ended && (
                    <button
                      onClick={() => endInstall(s.id)}
                      disabled={endingId === s.id}
                      className="flex-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white active:bg-orange-600 disabled:opacity-50"
                    >
                      {endingId === s.id ? "종료 중…" : "설치 종료"}
                    </button>
                  )}
                  <button
                    onClick={() => deleteSession(s)}
                    disabled={deletingId === s.id}
                    className="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 active:bg-red-50 disabled:opacity-50"
                  >
                    {deletingId === s.id ? "삭제 중…" : "삭제"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
