"use client";

import { useEffect, useState } from "react";

interface Row {
  team: string;
  name: string;
  phone: string;
  company: string;
}

// 설치팀 소속 관리 — 관리자 '소속' 탭. 팀 목록 자체는 '설치팀' 탭에서 관리하고,
// 여기서는 소속사 목록(추가·이름 변경·삭제, app_settings.team_companies)과 팀별 소속사를 바꿔 저장한다.
// 소속은 '설치팀별 확인' 페이지(/teams)의 그룹 필터·캡쳐에 쓰인다.
export default function TeamCompanyManager() {
  const [rows, setRows] = useState<Row[] | null>(null); // null = 로딩 중
  const [companies, setCompanies] = useState<string[]>([]);
  const [newCompany, setNewCompany] = useState("");
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
        setCompanies((j.companies as string[]) ?? []);
      } catch (e) {
        setRows([]);
        setMsg({ ok: false, text: e instanceof Error ? e.message : "불러오기 실패" });
      }
    })();
  }, []);

  const touch = () => {
    setDirty(true);
    setMsg(null);
  };

  function setCompany(i: number, company: string) {
    setRows((r) => (r ? r.map((x, idx) => (idx === i ? { ...x, company } : x)) : r));
    touch();
  }

  function addCompany() {
    const c = newCompany.trim();
    if (!c) return;
    if (companies.includes(c)) {
      setMsg({ ok: false, text: "이미 있는 소속사입니다." });
      return;
    }
    setCompanies((l) => [...l, c]);
    setNewCompany("");
    touch();
  }

  // 이름 변경 — 그 소속으로 지정된 팀도 같이 바뀐다
  function renameCompany(i: number, next: string) {
    const prev = companies[i];
    setCompanies((l) => l.map((x, idx) => (idx === i ? next : x)));
    setRows((r) => (r ? r.map((x) => (x.company === prev ? { ...x, company: next } : x)) : r));
    touch();
  }

  function removeCompany(i: number) {
    const c = companies[i];
    const used = (rows ?? []).filter((x) => x.company === c).length;
    if (used && !confirm(`"${c}" 소속 팀 ${used}개가 미지정으로 바뀝니다. 삭제할까요?`)) return;
    setCompanies((l) => l.filter((_, idx) => idx !== i));
    setRows((r) => (r ? r.map((x) => (x.company === c ? { ...x, company: "" } : x)) : r));
    touch();
  }

  async function save() {
    if (!rows || saving) return;
    const cleaned = companies.map((c) => c.trim()).filter(Boolean);
    if (new Set(cleaned).size !== cleaned.length) {
      setMsg({ ok: false, text: "소속사 이름이 중복됩니다." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list: rows.map((x) => ({ ...x, company: x.company.trim() })), companies: cleaned }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "저장 실패");
      setRows(j.list as Row[]);
      setCompanies((j.companies as string[]) ?? cleaned);
      setDirty(false);
      setMsg({ ok: true, text: "저장되었습니다." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "저장 실패" });
    } finally {
      setSaving(false);
    }
  }

  const usedCount = (c: string) => (rows ?? []).filter((x) => x.company === c).length;

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">🏢 설치팀 소속 관리</h2>
      <p className="mb-3 text-xs text-gray-500">
        소속사를 등록하고 팀별 소속을 지정합니다. &lsquo;설치팀별 확인&rsquo; 페이지의 그룹 필터에
        사용됩니다. 팀 추가·삭제는 &lsquo;설치팀&rsquo; 탭에서 하세요.
      </p>

      <div className="mb-3 rounded-xl border border-gray-200 bg-white p-3">
        <p className="mb-2 text-xs font-semibold text-gray-600">소속사 목록</p>
        {companies.length === 0 && (
          <p className="mb-2 text-xs text-gray-400">등록된 소속사가 없습니다. 아래에서 추가하세요.</p>
        )}
        <ul className="space-y-1.5">
          {companies.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                value={c}
                onChange={(e) => renameCompany(i, e.target.value)}
                maxLength={30}
                placeholder="소속사 이름"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <span className="w-12 shrink-0 text-right text-[11px] text-gray-400">{usedCount(c) ? `${usedCount(c)}팀` : ""}</span>
              <button
                type="button"
                aria-label="삭제"
                onClick={() => removeCompany(i)}
                className="rounded px-2 py-1 text-xs text-red-500 active:bg-red-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            value={newCompany}
            onChange={(e) => setNewCompany(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCompany();
              }
            }}
            maxLength={30}
            placeholder="새 소속사 이름"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={addCompany}
            disabled={!newCompany.trim() || companies.length >= 30}
            className="shrink-0 rounded-lg border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-600 active:bg-blue-50 disabled:opacity-40"
          >
            + 추가
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="mb-2 text-xs font-semibold text-gray-600">팀별 소속</p>
        {rows === null ? (
          <p className="py-4 text-center text-sm text-gray-400">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-400">
            등록된 팀이 없습니다. &lsquo;설치팀&rsquo; 탭에서 먼저 추가해 주세요.
          </p>
        ) : (
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
                  className="w-36 shrink-0 rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">미지정</option>
                  {companies.filter(Boolean).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={save}
        disabled={saving || !dirty || rows === null}
        className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "저장 중…" : dirty ? "저장" : "저장됨 ✓"}
      </button>
      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      )}
    </section>
  );
}
