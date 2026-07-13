"use client";

import { useEffect, useState } from "react";

// 설치팀 목록 관리 — 관리자 페이지 섹션.
// 기록 페이지의 팀명 드롭다운 선택지가 된다. (app_settings.install_teams)
export default function TeamNamesManager() {
  const [rows, setRows] = useState<string[] | null>(null); // null = 로딩 중
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/teams", { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "불러오기 실패");
        setRows(j.list as string[]);
      } catch (e) {
        setRows([]);
        setMsg({ ok: false, text: e instanceof Error ? e.message : "불러오기 실패" });
      }
    })();
  }, []);

  function update(i: number, v: string) {
    setRows((r) => (r ? r.map((x, idx) => (idx === i ? v : x)) : r));
    setDirty(true);
    setMsg(null);
  }

  function remove(i: number) {
    setRows((r) => (r ? r.filter((_, idx) => idx !== i) : r));
    setDirty(true);
    setMsg(null);
  }

  function add() {
    setRows((r) => [...(r ?? []), ""]);
    setDirty(true);
    setMsg(null);
  }

  async function save() {
    if (!rows || saving) return;
    const list = rows.map((s) => s.trim()).filter(Boolean);
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "저장 실패");
      setRows(j.list as string[]);
      setDirty(false);
      setMsg({ ok: true, text: "저장되었습니다." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "저장 실패" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">👷 설치팀 관리</h2>
      <p className="mb-3 text-xs text-gray-500">
        기록 페이지의 팀명 선택지입니다. 팀명은 한번 저장되면 관리자 비밀번호로만 변경할 수
        있습니다. (목록이 비어 있으면 기록 페이지는 직접 입력으로 동작)
      </p>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        {rows === null ? (
          <p className="py-4 text-center text-sm text-gray-400">불러오는 중…</p>
        ) : (
          <>
            {rows.length === 0 && (
              <p className="pb-2 text-center text-xs text-gray-400">
                등록된 팀이 없습니다. 추가해 주세요.
              </p>
            )}
            <ul className="space-y-2">
              {rows.map((name, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    value={name}
                    onChange={(e) => update(i, e.target.value)}
                    placeholder="예: 1팀"
                    maxLength={40}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => remove(i)}
                    className="shrink-0 rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-600 active:bg-red-50"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                onClick={add}
                className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 active:bg-gray-200"
              >
                + 추가
              </button>
              <button
                onClick={save}
                disabled={saving || !dirty}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "저장 중…" : dirty ? "저장" : "저장됨 ✓"}
              </button>
            </div>
            {msg && (
              <p className={`mt-2 text-xs ${msg.ok ? "text-green-600" : "text-red-500"}`}>
                {msg.text}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
