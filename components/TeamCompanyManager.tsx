"use client";

import { useEffect, useState } from "react";

interface Row {
  team: string;
  name: string;
  phone: string;
  company: string;
}

const COMPANIES = ["아림기술", "모리온"];

// 설치팀 소속 관리 — 관리자 '소속' 탭. 팀 목록 자체는 '설치팀' 탭에서 관리하고,
// 여기서는 팀별 소속사(아림기술/모리온)만 바꿔 저장한다. (app_settings.install_teams)
// 소속은 '설치팀별 확인' 페이지(/teams)의 그룹 필터·캡쳐에 쓰인다.
export default function TeamCompanyManager() {
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

  function setCompany(i: number, company: string) {
    setRows((r) => (r ? r.map((x, idx) => (idx === i ? { ...x, company } : x)) : r));
    setDirty(true);
    setMsg(null);
  }

  async function save() {
    if (!rows || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list: rows }),
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
      <h2 className="mb-2 text-sm font-semibold text-gray-700">🏢 설치팀 소속 관리</h2>
      <p className="mb-3 text-xs text-gray-500">
        팀별 소속사(아림기술/모리온)를 지정합니다. &lsquo;설치팀별 확인&rsquo; 페이지의 그룹
        필터에 사용됩니다. 팀 추가·삭제는 &lsquo;설치팀&rsquo; 탭에서 하세요.
      </p>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        {rows === null ? (
          <p className="py-4 text-center text-sm text-gray-400">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-400">
            등록된 팀이 없습니다. &lsquo;설치팀&rsquo; 탭에서 먼저 추가해 주세요.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {rows.map((row, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                    {row.team}
                    {row.name && <span className="ml-1 text-xs text-gray-400">{row.name}</span>}
                  </span>
                  <select
                    value={row.company}
                    onChange={(e) => setCompany(i, e.target.value)}
                    className="w-32 shrink-0 rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">미지정</option>
                    {COMPANIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "저장 중…" : dirty ? "저장" : "저장됨 ✓"}
            </button>
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
