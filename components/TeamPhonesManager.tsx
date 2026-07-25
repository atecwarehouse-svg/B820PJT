"use client";

import { useEffect, useState } from "react";

interface Row {
  name: string;
  phone: string;
}

// 설치팀 연락처 관리 — 관리자 페이지 설치팀 탭 섹션.
// 저장 목록 상단 전화 버튼의 연락처가 된다. (app_settings.install_team_phones)
export default function TeamPhonesManager() {
  const [rows, setRows] = useState<Row[] | null>(null); // null = 로딩 중
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/team-phones", { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "불러오기 실패");
        setRows(j.list as Row[]);
      } catch (e) {
        setRows([]);
        setMsg({ ok: false, text: e instanceof Error ? e.message : "불러오기 실패" });
      }
    })();
  }, []);

  function update(i: number, patch: Partial<Row>) {
    setRows((r) => (r ? r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) : r));
    setDirty(true);
    setMsg(null);
  }

  function remove(i: number) {
    setRows((r) => (r ? r.filter((_, idx) => idx !== i) : r));
    setDirty(true);
    setMsg(null);
  }

  function add() {
    setRows((r) => [...(r ?? []), { name: "", phone: "" }]);
    setDirty(true);
    setMsg(null);
  }

  async function save() {
    if (!rows || saving) return;
    const list = rows
      .map((r) => ({ name: r.name.trim(), phone: r.phone.trim() }))
      .filter((r) => r.name && r.phone);
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/team-phones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "저장 실패");
      setRows(j.list as Row[]);
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
      <h2 className="mb-2 text-sm font-semibold text-gray-700">📞 설치팀 연락처 관리</h2>
      <p className="mb-3 text-xs text-gray-500">
        저장 목록 상단의 설치팀 전화 버튼에 표시되는 연락처입니다. (비어 있으면 버튼 숨김)
      </p>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        {rows === null ? (
          <p className="py-4 text-center text-sm text-gray-400">불러오는 중…</p>
        ) : (
          <>
            {rows.length === 0 && (
              <p className="pb-2 text-center text-xs text-gray-400">
                등록된 연락처가 없습니다. 추가해 주세요.
              </p>
            )}
            <ul className="space-y-2">
              {rows.map((row, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    value={row.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="이름 (예: 1팀 홍길동)"
                    maxLength={40}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                  <input
                    value={row.phone}
                    onChange={(e) => update(i, { phone: e.target.value })}
                    placeholder="010-0000-0000"
                    type="tel"
                    maxLength={20}
                    className="w-36 shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
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
