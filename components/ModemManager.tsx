"use client";

import { useCallback, useEffect, useState } from "react";

interface ModemRow {
  id: number;
  date: string;
  plate: string;
  operator: string | null;
  kind: string;
  symptom: string | null;
  before_sn: string | null;
  after_sn: string | null;
}

// 관리자 페이지 — 배차표에서 등록한 LTE 모뎀불량 삭제.
// 삭제는 배차표 '정상으로 되돌리기'와 같은 경로(POST /api/modem, clear=1)라
// DB 행과 Drive 사진이 함께 지워진다.
export default function ModemManager() {
  const [list, setList] = useState<ModemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needMigration, setNeedMigration] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/modem", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "불러오기 실패");
      setList((json.list ?? []) as ModemRow[]);
      setNeedMigration(Boolean(json.needMigration));
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(m: ModemRow) {
    if (!confirm(`${m.date} ${m.plate} 모뎀불량 기록을 삭제할까요?\n등록한 사진(Drive)도 함께 삭제됩니다.`))
      return;
    setDeleting(m.id);
    try {
      const form = new FormData();
      form.append("date", m.date);
      form.append("plate", m.plate);
      form.append("clear", "1");
      const res = await fetch("/api/modem", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "삭제 실패");
      setList((l) => l.filter((x) => x.id !== m.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="mb-5">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">📶 LTE 모뎀불량</h2>
      <p className="mb-3 text-xs text-gray-500">
        배차표에서 등록한 모뎀불량(현장교체·증차·예비품불량·장애접수) 기록입니다. 잘못 등록한
        건을 삭제하면 Drive 사진도 함께 지워지고 사용내역 엑셀에서도 빠집니다.
      </p>

      {needMigration && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          저장 테이블이 아직 없습니다. Supabase SQL Editor에서 <b>migration_modem_defects.sql</b>을
          실행해주세요.
        </p>
      )}
      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      {loading ? (
        <p className="py-6 text-center text-sm text-gray-400">불러오는 중…</p>
      ) : list.length === 0 ? (
        !needMigration && (
          <p className="rounded-xl border border-gray-200 bg-white py-6 text-center text-sm text-gray-400">
            등록된 모뎀불량이 없습니다.
          </p>
        )
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {list.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-800">
                  {m.plate}
                  <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-700">
                    {m.kind}
                  </span>
                </p>
                <p className="truncate text-xs text-gray-400">
                  {m.date} · {m.operator ?? ""}
                  {m.symptom ? ` · ${m.symptom}` : ""}
                  {m.before_sn ? ` · 전 ${m.before_sn}` : ""}
                  {m.after_sn ? ` · 후 ${m.after_sn}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(m)}
                disabled={deleting === m.id}
                className="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 active:bg-red-50 disabled:opacity-50"
              >
                {deleting === m.id ? "삭제 중…" : "삭제"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
