"use client";

import { useCallback, useEffect, useState } from "react";

interface Consultation {
  id: number;
  operator: string;
  date: string;
  count: number | null;
  routes: string | null;
  list_check: string | null;
  list_change: string | null;
  place: string | null;
  work_start: string | null;
  day_off: string | null;
  next_day_off: string | null;
  arrival: string | null;
  next_first_bus: string | null;
  depot_out: string | null;
  key_method: string | null;
  engine_on: string | null;
  fuel: string | null;
  manager_day: string | null;
  manager_night: string | null;
  mount_display: string | null;
  mount_main: string | null;
  mount_board: string | null;
  handle_removal: string | null;
  notes: string | null;
  consulter: string | null;
  updated_at: string;
}

// 상세 표시·수정용 항목 라벨 (표시 순서 = 폼 순서)
const FIELDS: [keyof Consultation, string][] = [
  ["routes", "설치 노선"],
  ["list_check", "차량리스트 확인"],
  ["list_change", "변동사항"],
  ["place", "설치 장소"],
  ["work_start", "작업 시간(첫차 종료)"],
  ["day_off", "당일 휴차"],
  ["next_day_off", "익일 휴차"],
  ["arrival", "첫차 종료 후 도착"],
  ["next_first_bus", "익일 첫차 출발"],
  ["depot_out", "차고지 출발(첫차)"],
  ["key_method", "차키 협조"],
  ["engine_on", "작업 중 시동"],
  ["fuel", "충전 여부"],
  ["manager_day", "담당자(주간)"],
  ["manager_night", "담당자(야간)"],
  ["mount_display", "표출기"],
  ["mount_main", "통합단말기"],
  ["mount_board", "승차"],
  ["handle_removal", "격벽 손잡이 탈거"],
  ["notes", "특이사항"],
  ["consulter", "협의자"],
];

const INPUT =
  "mt-0.5 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

// 관리자 페이지 — 운수사 협의사항 조회·수정·삭제.
// 협의사항 폼에서 팀즈 전송 시 저장된 데이터(운수사+설치일당 최신 1건).
export default function ConsultationManager() {
  const [list, setList] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needMigration, setNeedMigration] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  // 수정 상태 — editId가 있으면 해당 항목이 편집 폼으로 표시됨
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Consultation>>({});
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/consultations", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "불러오기 실패");
      setList(json.list as Consultation[]);
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

  function startEdit(c: Consultation) {
    setEditId(c.id);
    setOpenId(c.id);
    setEditError(null);
    setForm({ ...c });
  }

  function cancelEdit() {
    setEditId(null);
    setEditError(null);
    setForm({});
  }

  function setField(key: keyof Consultation, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function saveEdit(id: number) {
    setSaving(true);
    setEditError(null);
    try {
      const payload: Record<string, unknown> = { id };
      for (const [key] of FIELDS) payload[key] = form[key] ?? "";
      payload.count = form.count ?? 0;

      const res = await fetch("/api/admin/consultations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "수정 실패");
      setList((l) => l.map((x) => (x.id === id ? (json.item as Consultation) : x)));
      cancelEdit();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "수정 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Consultation) {
    if (!confirm(`${c.operator} ${c.date} 협의사항을 삭제할까요?`)) return;
    setDeleting(c.id);
    try {
      const res = await fetch(`/api/admin/consultations?id=${c.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "삭제 실패");
      setList((l) => l.filter((x) => x.id !== c.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="mb-5">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">📋 운수사 협의사항</h2>
      <p className="mb-3 text-xs text-gray-500">
        협의사항 폼에서 팀즈 전송한 내용이 운수사+설치일 기준으로 저장됩니다. (재전송 시 최신
        내용으로 갱신 · 여기서 직접 수정도 가능)
      </p>

      {needMigration && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          저장 테이블이 아직 없습니다. Supabase SQL Editor에서{" "}
          <b>migration_consultations.sql</b>을 실행해주세요.
        </p>
      )}
      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      {loading ? (
        <p className="py-6 text-center text-sm text-gray-400">불러오는 중…</p>
      ) : list.length === 0 ? (
        !needMigration && (
          <p className="rounded-xl border border-gray-200 bg-white py-6 text-center text-sm text-gray-400">
            저장된 협의사항이 없습니다.
          </p>
        )
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {list.map((c) => (
            <li key={c.id}>
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setOpenId(openId === c.id ? null : c.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium text-gray-800">
                    {c.date?.slice(0, 10).replace(/-/g, ".")} · {c.operator}
                    {c.count ? (
                      <span className="ml-1 font-normal text-gray-400">{c.count}대</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-gray-400">
                    {c.routes || "노선 미표기"}
                    {c.consulter ? ` · 협의자 ${c.consulter}` : ""}
                    <span className="ml-1 text-gray-300">
                      {openId === c.id ? "▲ 접기" : "▼ 상세"}
                    </span>
                  </p>
                </button>
                {editId === c.id ? (
                  <button
                    onClick={cancelEdit}
                    className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 active:bg-gray-50"
                  >
                    취소
                  </button>
                ) : (
                  <button
                    onClick={() => startEdit(c)}
                    className="shrink-0 rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-600 active:bg-blue-50"
                  >
                    수정
                  </button>
                )}
                <button
                  onClick={() => handleDelete(c)}
                  disabled={deleting === c.id || editId === c.id}
                  className="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 active:bg-red-50 disabled:opacity-50"
                >
                  {deleting === c.id ? "삭제 중…" : "삭제"}
                </button>
              </div>

              {openId === c.id && editId !== c.id && (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-gray-50 bg-gray-50/50 px-3 py-2.5">
                  {FIELDS.map(([key, label]) => (
                    <div key={key} className="flex gap-1.5 text-xs">
                      <dt className="shrink-0 text-gray-400">{label}</dt>
                      <dd className="min-w-0 break-all text-gray-700">
                        {String(c[key] ?? "") || "-"}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {editId === c.id && (
                <div className="border-t border-gray-50 bg-blue-50/40 px-3 py-3">
                  <p className="mb-2 text-[11px] text-gray-500">
                    {c.date?.slice(0, 10).replace(/-/g, ".")} · {c.operator} — 내용 수정
                    <span className="ml-1 text-gray-400">(운수사·설치일은 변경 불가)</span>
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-[11px] font-medium text-gray-500">설치 대수</span>
                      <input
                        type="number"
                        min={0}
                        value={form.count ?? 0}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, count: Number(e.target.value) }))
                        }
                        className={INPUT}
                      />
                    </label>
                    {FIELDS.map(([key, label]) =>
                      key === "notes" ? (
                        <label key={key} className="block sm:col-span-2">
                          <span className="text-[11px] font-medium text-gray-500">
                            {label}
                          </span>
                          <textarea
                            value={String(form[key] ?? "")}
                            onChange={(e) => setField(key, e.target.value)}
                            rows={3}
                            className={INPUT}
                          />
                        </label>
                      ) : (
                        <label key={key} className="block">
                          <span className="text-[11px] font-medium text-gray-500">
                            {label}
                          </span>
                          <input
                            type="text"
                            value={String(form[key] ?? "")}
                            onChange={(e) => setField(key, e.target.value)}
                            className={INPUT}
                          />
                        </label>
                      ),
                    )}
                  </div>

                  {editError && (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                      {editError}
                    </p>
                  )}

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(c.id)}
                      disabled={saving}
                      className="flex-1 rounded-lg bg-blue-600 py-2 text-xs font-bold text-white active:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? "저장 중…" : "저장"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={saving}
                      className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-xs font-semibold text-gray-600 active:bg-gray-50 disabled:opacity-50"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
