"use client";

import { useEffect, useState } from "react";
import type { Checklist, ChecklistItem } from "@/lib/checklist";

// 검수항목 관리 — 관리자 페이지 섹션.
// 배차표 '검수항목 보기' 체크리스트를 수정한다. (app_settings.inspect_checklist)

type SectionKey = keyof Checklist;

const SECTIONS: { key: SectionKey; label: string; color: string }[] = [
  { key: "vehicle", label: "1. 차량 이상유무", color: "bg-emerald-600" },
  { key: "device", label: "2. 단말기 설치 상태", color: "bg-blue-600" },
];

export default function ChecklistManager() {
  const [data, setData] = useState<Checklist | null>(null); // null = 로딩 중
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/checklist", { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "불러오기 실패");
        setData({ vehicle: j.vehicle ?? [], device: j.device ?? [] });
      } catch (e) {
        setData({ vehicle: [], device: [] });
        setMsg({ ok: false, text: e instanceof Error ? e.message : "불러오기 실패" });
      }
    })();
  }, []);

  function mutate(fn: (d: Checklist) => Checklist) {
    setData((d) => (d ? fn(d) : d));
    setDirty(true);
    setMsg(null);
  }

  function update(sec: SectionKey, i: number, field: keyof ChecklistItem, v: string) {
    mutate((d) => ({
      ...d,
      [sec]: d[sec].map((x, idx) => (idx === i ? { ...x, [field]: v } : x)),
    }));
  }

  function remove(sec: SectionKey, i: number) {
    mutate((d) => ({ ...d, [sec]: d[sec].filter((_, idx) => idx !== i) }));
  }

  function add(sec: SectionKey) {
    mutate((d) => ({ ...d, [sec]: [...d[sec], { t: "", s: "" }] }));
  }

  async function save() {
    if (!data || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/checklist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "저장 실패");
      setData({ vehicle: j.vehicle, device: j.device });
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
      <h2 className="mb-2 text-sm font-semibold text-gray-700">✅ 검수항목 관리</h2>
      <p className="mb-3 text-xs text-gray-500">
        배차표의 &lsquo;검수항목 보기&rsquo; 체크리스트입니다. 항목명은 필수, 부연 설명은
        괄호 안에 작게 표시됩니다(비워도 됨). 저장하면 모든 기기에 바로 반영됩니다.
      </p>

      {data === null ? (
        <p className="py-4 text-center text-sm text-gray-400">불러오는 중…</p>
      ) : (
        <>
          {SECTIONS.map(({ key, label, color }) => (
            <div key={key} className="mb-4 rounded-xl border border-gray-200 bg-white">
              <h3 className={`rounded-t-xl px-3 py-2 text-sm font-bold text-white ${color}`}>
                {label}
              </h3>
              <div className="p-3">
                {data[key].length === 0 && (
                  <p className="pb-2 text-center text-xs text-gray-400">
                    항목이 없습니다. 추가해 주세요.
                  </p>
                )}
                <ul className="space-y-2">
                  {data[key].map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-5 shrink-0 text-right text-xs font-bold text-gray-400">
                        {i + 1}.
                      </span>
                      <input
                        value={item.t}
                        onChange={(e) => update(key, i, "t", e.target.value)}
                        placeholder="항목명"
                        maxLength={60}
                        className="min-w-0 flex-[2] rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      />
                      <input
                        value={item.s}
                        onChange={(e) => update(key, i, "s", e.target.value)}
                        placeholder="부연 설명(선택)"
                        maxLength={80}
                        className="min-w-0 flex-[2] rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => remove(key, i)}
                        className="shrink-0 rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-600 active:bg-red-50"
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => add(key)}
                  className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 active:bg-gray-200"
                >
                  + 항목 추가
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={save}
            disabled={saving || !dirty}
            className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
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
    </section>
  );
}
