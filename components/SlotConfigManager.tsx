"use client";

import { useEffect, useState } from "react";
import { newSlotKey, type SlotConfigJson } from "@/lib/slots";

// 사진 양식(칸 구성) 관리 — 관리자 페이지 '사진 양식' 탭.
// 차량 이상유무 / 설치 전 / 설치 후 칸의 이름을 바꾸고 추가·삭제·순서 변경한다. (app_settings.photo_slots, 프로젝트별)
//   - 설치 후 칸의 '추가 촬영'은 저장만 하고 완료 판정·PDF에는 넣지 않는 칸(예: 타코케이블 Y자)
//   - 차량 이상유무의 '사진 필수'는 '없음' 체크로 대신할 수 없는 칸
//   - 이미 사진이 올라간 칸을 지우면 사진은 남고 화면에서만 숨겨진다(경고 표시)

type Section = "before" | "after" | "check";
type Item = { key: string; label: string; extra?: boolean; required?: boolean };

const SECTIONS: { key: Section; title: string; hint: string; color: string }[] = [
  { key: "check", title: "차량 이상유무", hint: "작업 시작 전 촬영 · 설치시작 알림 조건", color: "bg-emerald-600" },
  { key: "before", title: "설치 전", hint: "완료 판정·PDF/엑셀에 포함", color: "bg-blue-600" },
  { key: "after", title: "설치 후", hint: "완료 판정·PDF/엑셀에 포함 ('추가 촬영'은 제외)", color: "bg-indigo-600" },
];

export default function SlotConfigManager() {
  const [data, setData] = useState<SlotConfigJson | null>(null); // null = 로딩 중
  const [defaults, setDefaults] = useState<SlotConfigJson | null>(null);
  const [used, setUsed] = useState<Record<string, number>>({});
  const [isDefault, setIsDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/photo-slots", { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "불러오기 실패");
        setData(j.config);
        setDefaults(j.defaults);
        setUsed(j.used ?? {});
        setIsDefault(!!j.isDefault);
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "불러오기 실패" });
      }
    })();
  }, []);

  function mutate(section: Section, fn: (list: Item[]) => Item[]) {
    setData((d) => (d ? { ...d, [section]: fn(d[section] as Item[]) } : d));
    setDirty(true);
    setMsg(null);
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/photo-slots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "저장 실패");
      setData(j.config);
      setIsDefault(!!j.isDefault);
      setDirty(false);
      setMsg({ ok: true, text: "저장했습니다. 촬영 화면·PDF·완료 판정에 바로 적용됩니다." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "저장 실패" });
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/photo-slots", { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "초기화 실패");
      setData(j.config);
      setIsDefault(true);
      setDirty(false);
      setMsg({ ok: true, text: "B820 기본 양식으로 되돌렸습니다." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "초기화 실패" });
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <p className="py-6 text-center text-sm text-gray-400">{msg?.text ?? "불러오는 중…"}</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
        <p className="font-semibold text-blue-700">촬영 칸(양식)을 이 프로젝트에 맞게 조정합니다</p>
        <p className="mt-1">
          칸 이름을 고치거나 추가·삭제할 수 있습니다. 저장하면 차량 촬영 화면, PDF/엑셀 사진첩, 설치 시작·완료
          판정이 모두 이 구성을 따릅니다. {isDefault ? "지금은 B820 기본 양식입니다." : "현재 이 프로젝트 전용 양식이 적용돼 있습니다."}
        </p>
      </div>

      {SECTIONS.map((sec) => {
        const list = data[sec.key] as Item[];
        return (
          <section key={sec.key} className="rounded-xl border border-gray-200 bg-white">
            <div className={`flex items-center justify-between rounded-t-xl px-3 py-2 text-white ${sec.color}`}>
              <div>
                <p className="text-sm font-bold">{sec.title} <span className="font-normal opacity-80">{list.length}칸</span></p>
                <p className="text-[11px] opacity-80">{sec.hint}</p>
              </div>
              <button
                type="button"
                onClick={() => mutate(sec.key, (l) => [...l, { key: newSlotKey(sec.key), label: "" }])}
                disabled={list.length >= 20}
                className="rounded-lg bg-white/20 px-2.5 py-1 text-xs font-semibold active:bg-white/30 disabled:opacity-40"
              >
                + 칸 추가
              </button>
            </div>
            <ul className="divide-y divide-gray-100">
              {list.map((it, i) => (
                <li key={it.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="w-5 text-right text-xs text-gray-400">{i + 1}</span>
                  <input
                    value={it.label}
                    onChange={(e) =>
                      mutate(sec.key, (l) => l.map((x) => (x.key === it.key ? { ...x, label: e.target.value } : x)))
                    }
                    maxLength={30}
                    placeholder="칸 이름"
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none"
                  />
                  {sec.key === "check" && (
                    <label className="flex items-center gap-1 text-[11px] text-gray-600">
                      <input
                        type="checkbox"
                        checked={!!it.required}
                        onChange={(e) =>
                          mutate(sec.key, (l) => l.map((x) => (x.key === it.key ? { ...x, required: e.target.checked } : x)))
                        }
                      />
                      사진 필수
                    </label>
                  )}
                  {sec.key === "after" && (
                    <label className="flex items-center gap-1 text-[11px] text-gray-600">
                      <input
                        type="checkbox"
                        checked={!!it.extra}
                        onChange={(e) =>
                          mutate(sec.key, (l) => l.map((x) => (x.key === it.key ? { ...x, extra: e.target.checked } : x)))
                        }
                      />
                      추가 촬영
                    </label>
                  )}
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-label="위로"
                      disabled={i === 0}
                      onClick={() => mutate(sec.key, (l) => { const n = [...l]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}
                      className="rounded px-1.5 py-1 text-xs text-gray-500 active:bg-gray-100 disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label="아래로"
                      disabled={i === list.length - 1}
                      onClick={() => mutate(sec.key, (l) => { const n = [...l]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}
                      className="rounded px-1.5 py-1 text-xs text-gray-500 active:bg-gray-100 disabled:opacity-30"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      aria-label="삭제"
                      onClick={() => mutate(sec.key, (l) => l.filter((x) => x.key !== it.key))}
                      className="rounded px-1.5 py-1 text-xs text-red-500 active:bg-red-50"
                    >
                      ✕
                    </button>
                  </div>
                  {used[it.key] ? (
                    <span className="basis-full pl-7 text-[11px] text-amber-700">
                      사진 {used[it.key]}장 있음 — 지워도 사진은 남고 화면에서만 숨겨집니다
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={saving || (isDefault && !dirty)}
          className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-600 active:bg-gray-100 disabled:opacity-40"
        >
          기본 양식으로
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-40"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
      {defaults && !isDefault && (
        <p className="text-[11px] text-gray-400">
          기본 양식: 이상유무 {defaults.check.length}칸 · 설치 전 {defaults.before.length}칸 · 설치 후 {defaults.after.length}칸
        </p>
      )}
    </div>
  );
}
