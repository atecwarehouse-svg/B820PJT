"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReportRecipientsManager from "@/components/ReportRecipientsManager";
import TeamNamesManager from "@/components/TeamNamesManager";
import ChecklistManager from "@/components/ChecklistManager";
import ConsultationManager from "@/components/ConsultationManager";
import VocManager from "@/components/VocManager";
import ModemManager from "@/components/ModemManager";

interface AdminRecord {
  plate: string;
  operator: string | null;
  route: string | null;
  saved_at: string | null;
  photoCount: number;
  is_added: boolean;
  planned_date: string | null;
}

const TABS = [
  "설치팀",
  "검수항목",
  "메일 수신자",
  "협의사항",
  "VOC",
  "모뎀불량",
  "차량 삭제",
  "DB 삭제",
] as const;
type Tab = (typeof TABS)[number];

export default function AdminPanel() {
  const [tab, setTab] = useState<Tab>("설치팀");
  const [q, setQ] = useState("");
  const [list, setList] = useState<AdminRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async (query: string, addedOnly = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/records?q=${encodeURIComponent(query)}${addedOnly ? "&added=1" : ""}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "불러오기 실패");
      setList(json.list as AdminRecord[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  const isDb = tab === "DB 삭제";
  // 삭제 탭에 들어올 때마다 그 탭 기준으로 다시 조회 (차량 삭제=기록 있는 차량 / DB 삭제=증차 차량)
  useEffect(() => {
    if (tab !== "차량 삭제" && tab !== "DB 삭제") return;
    setQ("");
    load("", tab === "DB 삭제");
  }, [tab, load]);

  async function handleDelete(rec: AdminRecord) {
    const extra = rec.is_added ? "\n(증차 차량이라 차량리스트에서도 완전 삭제됩니다)" : "";
    const msg = isDb
      ? `${rec.plate} 을(를) 차량리스트(DB)에서 완전히 삭제할까요?\n사진 ${rec.photoCount}장·기록·Drive 파일도 함께 삭제되며 되돌릴 수 없습니다.`
      : `${rec.plate} 의 업로드 사진 ${rec.photoCount}장과 기록을 삭제할까요?\n구글 드라이브 파일도 함께 삭제됩니다.${extra}`;
    if (!confirm(msg)) return;
    setDeleting(rec.plate);
    try {
      const res = await fetch(
        `/api/admin/vehicle?plate=${encodeURIComponent(rec.plate)}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "삭제 실패");
      setList((l) => l.filter((r) => r.plate !== rec.plate));
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeleting(null);
    }
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-blue-600">
          ← 처음으로
        </Link>
        <h1 className="text-lg font-bold text-blue-700">관리자</h1>
        <button onClick={logout} className="text-sm text-gray-400">
          로그아웃
        </button>
      </div>

      {/* 기준사진 관리 이동 */}
      <Link
        href="/admin/reference"
        className="mb-5 flex items-center justify-between rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm active:bg-gray-100"
      >
        <span>🖼️ 기준(양식) 사진 관리</span>
        <span className="text-gray-400">→</span>
      </Link>

      {/* 섹션별 탭 */}
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              tab === t ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "설치팀" && <TeamNamesManager />}
      {tab === "검수항목" && <ChecklistManager />}
      {tab === "메일 수신자" && <ReportRecipientsManager />}
      {tab === "협의사항" && <ConsultationManager />}
      {tab === "VOC" && <VocManager />}
      {tab === "모뎀불량" && <ModemManager />}

      {(tab === "차량 삭제" || isDb) && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">{tab}</h2>
          <p className="mb-3 text-xs text-gray-500">
            {isDb
              ? "잘못 입력한 증차 차량을 차량리스트(DB)에서 완전히 삭제합니다. 사진·기록·Drive 파일도 함께 삭제됩니다."
              : "잘못 업로드했거나 테스트한 차량의 사진·기록을 삭제합니다. (Drive 파일 포함)"}
          </p>

          <div className="mb-3 flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load(q, isDb)}
              placeholder="차량번호 검색 (예: 인천70바)"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <button
              onClick={() => load(q, isDb)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white active:bg-blue-700"
            >
              검색
            </button>
          </div>

          {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-400">불러오는 중…</p>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              {isDb ? "증차로 추가된 차량이 없습니다." : "업로드된 차량이 없습니다."}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {list.map((r) => (
                <li key={r.plate} className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {r.plate}
                      {r.is_added && (
                        <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">
                          증차
                        </span>
                      )}
                      {r.saved_at && (
                        <span className="ml-1 rounded bg-green-100 px-1 text-[10px] font-semibold text-green-700">
                          저장됨
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-gray-400">
                      {r.operator ?? ""} {r.route ?? ""} · 사진 {r.photoCount}장
                      {isDb && r.planned_date ? ` · 예정 ${r.planned_date}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(r)}
                    disabled={deleting === r.plate}
                    className="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 active:bg-red-50 disabled:opacity-50"
                  >
                    {deleting === r.plate ? "삭제 중…" : isDb ? "DB 삭제" : "삭제"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
