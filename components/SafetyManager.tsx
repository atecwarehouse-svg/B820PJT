"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { downloadUrl } from "@/lib/download";

export interface PledgeSessionRow {
  id: string;
  manager_name: string;
  operator: string | null;
  location: string | null;
  install_date: string;
  signer_count: number;
}

// 안전관리자용 화면: 세션(공유 링크) 생성 + 기존 세션 목록/다운로드.
export default function SafetyManager({ sessions }: { sessions: PledgeSessionRow[] }) {
  const router = useRouter();
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [manager, setManager] = useState("");
  const [operator, setOperator] = useState("");
  const [location, setLocation] = useState("");
  const [installDate, setInstallDate] = useState(today);
  const [quantity, setQuantity] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    if (!manager.trim()) {
      setError("안전관리자 이름을 입력하세요.");
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
          operator,
          location,
          install_date: installDate,
          quantity,
          start_time: startTime,
          end_time: endTime,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "생성 실패");
      const link = `${window.location.origin}/safety/${json.id}`;
      setCreatedLink(link);
      setCopied(false);
      router.refresh(); // 목록 갱신
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 실패 시 프롬프트로 대체
      window.prompt("링크를 복사하세요", link);
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
            <span className="text-[11px] font-medium text-gray-500">설치시간</span>
            <input value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} placeholder="예: 09:00" />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-gray-500">종료시간</span>
            <input value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} placeholder="예: 18:00" />
          </label>
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <button
          onClick={create}
          disabled={creating}
          className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
        >
          {creating ? "생성 중…" : "링크 생성"}
        </button>

        {createdLink && (
          <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
            <p className="text-[11px] font-medium text-blue-700">작업자용 서명 링크</p>
            <p className="mt-1 break-all text-xs text-gray-700">{createdLink}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => copyLink(createdLink)}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white active:bg-blue-700"
              >
                {copied ? "복사됨 ✓" : "링크 복사"}
              </button>
              <a
                href={createdLink}
                target="_blank"
                rel="noopener"
                className="flex-1 rounded-lg border border-blue-300 bg-white px-3 py-2 text-center text-xs font-semibold text-blue-700 active:bg-blue-100"
              >
                열어보기
              </a>
            </div>
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
                <button
                  onClick={() => copyLink(`${window.location.origin}/safety/${s.id}`)}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 active:bg-gray-100"
                >
                  서명 링크 복사
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
