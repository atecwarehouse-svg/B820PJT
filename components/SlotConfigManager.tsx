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
  { key: "check", title: "설치전 특이사항", hint: "작업 시작 전 촬영 · 설치시작 알림 조건", color: "bg-emerald-600" },
  { key: "before", title: "설치 전", hint: "완료 판정·PDF/엑셀에 포함", color: "bg-blue-600" },
  { key: "after", title: "설치 후", hint: "완료 판정·PDF/엑셀에 포함 ('추가 촬영'은 제외)", color: "bg-indigo-600" },
];

// 칸 편집 본문 — 관리자 '사진 양식' 탭과 프로젝트 생성 팝업이 같이 쓴다 (값·변경만 받는 제어 컴포넌트).
export function SlotEditor({
  value,
  used = {},
  onChange,
}: {
  value: SlotConfigJson;
  used?: Record<string, number>; // 칸별 이미 올라간 사진 수 (삭제 경고용)
  onChange: (next: SlotConfigJson) => void;
}) {
  const data = value;
  const mutate = (section: Section, fn: (list: Item[]) => Item[]) =>
    onChange({ ...data, [section]: fn(data[section] as Item[]) } as SlotConfigJson);
  return (
    <>
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

      {/* 팀즈 설치 시작 카드 발송 시점 — 서버 판정(lib/install-status.ts)과 촬영 화면 안내가 이 값을 따른다 */}
      {(() => {
        const sn = data.startNotify ?? { mode: "all" as const };
        const max = data.check.length + data.before.length;
        const hasRequired = data.check.some((c) => c.required);
        const set = (next: SlotConfigJson["startNotify"]) => {
          const { startNotify: _drop, ...rest } = data; // 기본(all)은 키를 빼서 기본 양식 비교(JSON)가 어긋나지 않게
          void _drop;
          onChange(!next || next.mode === "all" ? rest : { ...rest, startNotify: next });
        };
        const opt = "flex items-start gap-2 px-3 py-2 text-sm text-gray-700";
        return (
          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="rounded-t-xl bg-amber-600 px-3 py-2 text-white">
              <p className="text-sm font-bold">팀즈 설치 시작 카드 발송 시점</p>
              <p className="text-[11px] opacity-80">저장을 눌렀을 때 아래 조건이 되면 설치 시작 카드가 나갑니다 (완료 카드는 설치 전·후 전부)</p>
            </div>
            <div className="divide-y divide-gray-100">
              <label className={opt}>
                <input type="radio" name="startNotify" className="mt-1" checked={sn.mode === "all"} onChange={() => set(undefined)} />
                <span><b>모든 칸을 채우면</b> (기본) <span className="block text-[11px] text-gray-500">설치전 특이사항 전부(사진 또는 「없음」 체크) + 설치 전 전부. 빈 칸이 있으면 다음·저장 때 안내가 뜹니다.</span></span>
              </label>
              <label className={`${opt} ${hasRequired ? "" : "opacity-50"}`}>
                <input type="radio" name="startNotify" className="mt-1" disabled={!hasRequired} checked={sn.mode === "required"} onChange={() => set({ mode: "required" })} />
                <span><b>사진 필수 칸만 찍으면</b> <span className="block text-[11px] text-gray-500">설치전 특이사항에서 「사진 필수」로 표시한 칸의 사진이 모두 있으면 발송{hasRequired ? "" : " — 먼저 위에서 사진 필수 칸을 지정하세요"}</span></span>
              </label>
              <label className={opt}>
                <input type="radio" name="startNotify" className="mt-1" checked={sn.mode === "count"} onChange={() => set({ mode: "count", count: Math.min(3, max) })} />
                <span className="flex flex-wrap items-center gap-1">
                  <b>사진</b>
                  <input
                    type="number"
                    min={1}
                    max={max}
                    value={sn.mode === "count" ? sn.count : ""}
                    disabled={sn.mode !== "count"}
                    onChange={(e) => set({ mode: "count", count: Math.max(1, Math.min(max, Number(e.target.value) || 1)) })}
                    className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-center text-sm disabled:bg-gray-50"
                  />
                  <b>장부터</b>
                  <span className="basis-full text-[11px] text-gray-500">설치전 특이사항 + 설치 전 사진을 합쳐 이 장수 이상이면 발송 (최대 {max}장, 「없음」 체크는 세지 않음)</span>
                </span>
              </label>
            </div>
          </section>
        );
      })()}
    </>
  );
}

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

      <SlotEditor value={data} used={used} onChange={(next) => { setData(next); setDirty(true); setMsg(null); }} />

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
          기본 양식: 설치전 특이사항 {defaults.check.length}칸 · 설치 전 {defaults.before.length}칸 · 설치 후 {defaults.after.length}칸
        </p>
      )}
    </div>
  );
}
