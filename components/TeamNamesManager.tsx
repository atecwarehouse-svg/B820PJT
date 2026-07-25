"use client";

import { useEffect, useState } from "react";

interface Row {
  team: string;
  name: string;
  phone: string;
}

// 설치팀 관리(팀명·이름·전화번호) — 관리자 페이지 섹션. (app_settings.install_teams)
// 기록 페이지 드롭다운·팀즈 카드에는 "팀명 이름"까지만 표시되고,
// 전화번호는 홈 '설치팀 호출' 버튼에서만 쓰인다.
export default function TeamNamesManager() {
  const [rows, setRows] = useState<Row[] | null>(null); // null = 로딩 중
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/teams", { cache: "no-store" });
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
    setRows((r) => [...(r ?? []), { team: "", name: "", phone: "" }]);
    setDirty(true);
    setMsg(null);
  }

  async function save() {
    if (!rows || saving) return;
    const list = rows
      .map((r) => ({ team: r.team.trim(), name: r.name.trim(), phone: r.phone.trim() }))
      .filter((r) => r.team);
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
      <h2 className="mb-2 text-sm font-semibold text-gray-700">👷 설치팀 관리</h2>
      <p className="mb-3 text-xs text-gray-500">
        기록 페이지 팀 선택지와 홈 &lsquo;설치팀 호출&rsquo; 버튼의 연락처입니다. 드롭다운·팀즈
        카드에는 팀명+이름까지만 표시되고 전화번호는 호출 버튼에서만 쓰입니다. (목록이 비어
        있으면 기록 페이지는 직접 입력으로 동작)
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
              {rows.map((row, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <input
                    value={row.team}
                    onChange={(e) => update(i, { team: e.target.value })}
                    placeholder="팀명"
                    maxLength={40}
                    className="w-16 min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:border-blue-500"
                  />
                  <input
                    value={row.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="이름"
                    maxLength={40}
                    className="w-16 min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:border-blue-500"
                  />
                  <input
                    value={row.phone}
                    onChange={(e) => update(i, { phone: e.target.value })}
                    placeholder="전화번호"
                    type="tel"
                    maxLength={20}
                    className="w-32 shrink-0 rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => remove(i)}
                    className="shrink-0 rounded-lg border border-red-300 px-2 py-2 text-xs font-semibold text-red-600 active:bg-red-50"
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
