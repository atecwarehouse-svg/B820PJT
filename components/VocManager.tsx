"use client";

import { useCallback, useEffect, useState } from "react";

interface VocItem {
  plate: string;
  route?: string;
  voc: string;
}

interface VocRow {
  id: number;
  operator: string;
  date: string;
  items: VocItem[];
  day_off: string[];
  notes: string | null;
  updated_at: string;
}

const INPUT =
  "mt-0.5 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

// 관리자 페이지 — 운수사 VOC 조회·수정·삭제.
// 대시보드 'VOC 접수' 폼에서 저장된 데이터(운수사+설치일당 최신 1건).
export default function VocManager() {
  const [list, setList] = useState<VocRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needMigration, setNeedMigration] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const [editId, setEditId] = useState<number | null>(null);
  const [items, setItems] = useState<VocItem[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/voc", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "불러오기 실패");
      setList((json.list ?? []) as VocRow[]);
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

  function startEdit(v: VocRow) {
    setEditId(v.id);
    setOpenId(v.id);
    setEditError(null);
    setItems((v.items ?? []).map((i) => ({ ...i })));
    setNotes(v.notes ?? "");
  }

  function cancelEdit() {
    setEditId(null);
    setEditError(null);
    setItems([]);
    setNotes("");
  }

  async function saveEdit(v: VocRow) {
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch("/api/admin/voc", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: v.id, items, day_off: v.day_off ?? [], notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "수정 실패");
      setList((l) => l.map((x) => (x.id === v.id ? (json.item as VocRow) : x)));
      cancelEdit();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "수정 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(v: VocRow) {
    if (!confirm(`${v.operator} ${v.date} VOC를 삭제할까요?`)) return;
    setDeleting(v.id);
    try {
      const res = await fetch(`/api/admin/voc?id=${v.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "삭제 실패");
      setList((l) => l.filter((x) => x.id !== v.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="mb-5">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">📣 운수사 VOC</h2>
      <p className="mb-3 text-xs text-gray-500">
        대시보드 &lsquo;VOC 접수&rsquo;에서 저장된 내용이 운수사+설치일 기준으로 보관됩니다. (다시
        저장하면 최신 내용으로 갱신 · 여기서 직접 수정도 가능)
      </p>

      {needMigration && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          저장 테이블이 아직 없습니다. Supabase SQL Editor에서 <b>migration_voc.sql</b>을
          실행해주세요.
        </p>
      )}
      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      {loading ? (
        <p className="py-6 text-center text-sm text-gray-400">불러오는 중…</p>
      ) : list.length === 0 ? (
        !needMigration && (
          <p className="rounded-xl border border-gray-200 bg-white py-6 text-center text-sm text-gray-400">
            저장된 VOC가 없습니다.
          </p>
        )
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {list.map((v) => {
            const vocCount = (v.items ?? []).filter((i) => i.voc?.trim()).length;
            const editing = editId === v.id;
            return (
              <li key={v.id} className="px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === v.id ? null : v.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-semibold text-gray-800">
                      {v.operator} · {v.date}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      VOC {vocCount}건 · 차량 {(v.items ?? []).length}대
                      {(v.day_off ?? []).length > 0 && ` · 휴차 ${v.day_off.length}대`}
                    </p>
                  </button>
                  {editing ? (
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 active:bg-gray-100"
                    >
                      취소
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(v)}
                      className="shrink-0 rounded-lg border border-green-300 px-3 py-1.5 text-xs font-medium text-green-600 active:bg-green-50"
                    >
                      수정
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(v)}
                    disabled={deleting === v.id || editing}
                    className="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 active:bg-red-50 disabled:opacity-50"
                  >
                    {deleting === v.id ? "삭제 중…" : "삭제"}
                  </button>
                </div>

                {openId === v.id && !editing && (
                  <div className="mt-2 space-y-1 rounded-lg bg-gray-50 px-3 py-2">
                    {(v.items ?? []).filter((i) => i.voc?.trim()).length === 0 ? (
                      <p className="text-[11px] text-gray-400">접수된 VOC 없음</p>
                    ) : (
                      (v.items ?? [])
                        .filter((i) => i.voc?.trim())
                        .map((i) => (
                          <p key={i.plate} className="text-xs text-gray-700">
                            <span className="font-medium">{i.plate}</span>
                            {i.route && <span className="text-gray-400"> {i.route}</span>} :{" "}
                            {i.voc}
                          </p>
                        ))
                    )}
                    {(v.day_off ?? []).length > 0 && (
                      <p className="text-[11px] text-gray-500">휴차: {v.day_off.join(", ")}</p>
                    )}
                    {v.notes && <p className="text-xs text-gray-700">특이사항: {v.notes}</p>}
                  </div>
                )}

                {editing && (
                  <div className="mt-2 space-y-2 rounded-lg bg-green-50/60 px-3 py-2">
                    {items.map((i, idx) => (
                      <label key={i.plate} className="block">
                        <span className="text-[11px] font-medium text-gray-500">
                          {i.plate}
                          {i.route && <span className="text-gray-400"> {i.route}</span>}
                        </span>
                        <input
                          value={i.voc ?? ""}
                          onChange={(e) =>
                            setItems((arr) =>
                              arr.map((x, k) => (k === idx ? { ...x, voc: e.target.value } : x)),
                            )
                          }
                          placeholder="VOC 내용 (없으면 비워두세요)"
                          className={INPUT}
                        />
                      </label>
                    ))}
                    <label className="block">
                      <span className="text-[11px] font-medium text-gray-500">특이사항</span>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        className={INPUT}
                      />
                    </label>
                    {editError && <p className="text-xs text-red-500">{editError}</p>}
                    <button
                      type="button"
                      onClick={() => saveEdit(v)}
                      disabled={saving}
                      className="w-full rounded-lg bg-green-600 py-2 text-xs font-bold text-white active:bg-green-700 disabled:opacity-50"
                    >
                      {saving ? "저장 중…" : "수정 저장"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
