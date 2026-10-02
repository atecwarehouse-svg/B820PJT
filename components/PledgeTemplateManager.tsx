"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_PLEDGE_TEMPLATE,
  PLEDGE_BASE_NAME,
  isDefaultPledgeTemplate,
  type PledgeTemplate,
} from "@/lib/pledge-template";

// 안전관리 서약서 양식 편집 — 관리자 '서약서 양식' 탭과 프로젝트 생성 팝업이 같이 쓴다.
//   PledgeTemplateEditor: 값·변경만 받는 제어 컴포넌트 (제목·회사명·교육내용 목록·서약 문구)
//   PledgeTemplateManager(기본): 불러오기/저장/기준양식 되돌리기 (app_settings.safety_pledge)

const input =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-base transition-colors focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100";

export function PledgeTemplateEditor({
  value,
  onChange,
  titlePlaceholder = "비우면 자동 — <프로젝트명> 안전관리 서약서",
}: {
  value: PledgeTemplate;
  onChange: (next: PledgeTemplate) => void;
  titlePlaceholder?: string;
}) {
  const set = (patch: Partial<PledgeTemplate>) => onChange({ ...value, ...patch });
  const items = value.eduItems;
  const setItems = (next: string[]) => set({ eduItems: next });
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-xs font-bold text-gray-500">서약서 제목</p>
        <input value={value.title} onChange={(e) => set({ title: e.target.value })} maxLength={60} placeholder={titlePlaceholder} className={input} />
      </div>
      <div>
        <p className="mb-1 text-xs font-bold text-gray-500">회사명 (설치사)</p>
        <input value={value.company} onChange={(e) => set({ company: e.target.value })} maxLength={40} placeholder="예: 에이텍모빌리티" className={input} />
      </div>
      <section className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="flex items-center justify-between rounded-t-2xl bg-emerald-600 px-3 py-2 text-white">
          <div>
            <p className="text-sm font-bold">
              [교육내용] <span className="font-normal opacity-80">{items.length}항목</span>
            </p>
            <p className="text-[11px] opacity-80">1페이지에 번호 목록으로 인쇄됩니다</p>
          </div>
          <button
            type="button"
            onClick={() => setItems([...items, ""])}
            disabled={items.length >= 20}
            className="rounded-lg bg-white/20 px-2.5 py-1 text-xs font-semibold active:bg-white/30 disabled:opacity-40"
          >
            + 항목 추가
          </button>
        </div>
        <ul className="divide-y divide-gray-100">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 px-3 py-2">
              <span className="mt-2.5 w-5 text-right text-xs text-gray-400">{i + 1}</span>
              <textarea
                value={it}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))}
                rows={3}
                maxLength={300}
                placeholder="교육내용"
                className={`${input} min-w-0 flex-1 resize-y text-sm`}
              />
              <div className="flex flex-col items-center gap-0.5">
                <button type="button" aria-label="위로" disabled={i === 0} onClick={() => { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setItems(n); }} className="rounded px-1.5 py-0.5 text-xs text-gray-500 active:bg-gray-100 disabled:opacity-30">▲</button>
                <button type="button" aria-label="아래로" disabled={i === items.length - 1} onClick={() => { const n = [...items]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setItems(n); }} className="rounded px-1.5 py-0.5 text-xs text-gray-500 active:bg-gray-100 disabled:opacity-30">▼</button>
                <button type="button" aria-label="삭제" disabled={items.length <= 1} onClick={() => setItems(items.filter((_, j) => j !== i))} className="rounded px-1.5 py-0.5 text-xs text-red-500 active:bg-red-50 disabled:opacity-30">✕</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div>
        <p className="mb-1 text-xs font-bold text-gray-500">서약 문구 (2페이지 하단)</p>
        <textarea value={value.pledgeText} onChange={(e) => set({ pledgeText: e.target.value })} rows={3} maxLength={500} className={`${input} resize-y text-sm`} />
      </div>
    </div>
  );
}

export default function PledgeTemplateManager() {
  const [data, setData] = useState<PledgeTemplate | null>(null); // null = 로딩 중
  const [isDefault, setIsDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/pledge-template", { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "불러오기 실패");
        setData(j.template);
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
      const res = await fetch("/api/admin/pledge-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "저장 실패");
      setData(j.template);
      setIsDefault(!!j.isDefault);
      setDirty(false);
      setMsg({ ok: true, text: "저장했습니다. 이후 내려받는 서약서 PDF부터 적용됩니다." });
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
      const res = await fetch("/api/admin/pledge-template", { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "초기화 실패");
      setData(j.template);
      setIsDefault(true);
      setDirty(false);
      setMsg({ ok: true, text: `기준양식(${PLEDGE_BASE_NAME})으로 되돌렸습니다.` });
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
        <p className="font-semibold text-blue-700">🖊️ 안전관리 서약서 양식 — 기준양식: {PLEDGE_BASE_NAME}</p>
        <p className="mt-1">
          서약서 PDF의 제목·회사명·교육내용·서약 문구를 이 프로젝트에 맞게 고칩니다. 작업자 서명표(2페이지)는 공통입니다.{" "}
          {isDefault ? "지금은 기준양식입니다." : "현재 이 프로젝트 전용 양식이 적용돼 있습니다."}
        </p>
      </div>
      <PledgeTemplateEditor value={data} onChange={(n) => { setData(n); setDirty(true); setMsg(null); }} />
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={saving || (isDefault && !dirty && isDefaultPledgeTemplate(data))}
          className="rounded-xl bg-white px-4 py-2.5 text-sm text-gray-600 shadow-sm ring-1 ring-black/5 active:bg-gray-100 disabled:opacity-40"
        >
          기준양식으로
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm active:bg-blue-700 disabled:opacity-40"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
      {!isDefault && (
        <p className="text-[11px] text-gray-400">기준양식: 교육내용 {DEFAULT_PLEDGE_TEMPLATE.eduItems.length}항목 · 회사명 {DEFAULT_PLEDGE_TEMPLATE.company}</p>
      )}
    </div>
  );
}
