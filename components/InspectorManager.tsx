"use client";

import { useEffect, useState } from "react";

interface Row {
  name: string;
  url: string; // 팀즈 개인 채팅방 웹훅 (워크플로 "웹후크 요청을 받는 경우 채팅에 게시")
}

// 검수자 관리 — 관리자 페이지 '검수자' 탭 (app_settings.inspectors, 프로젝트별).
// 이름은 설치시작 보고의 담당자 선택 버튼이 되고, 웹훅은 그 검수자 개인방으로
// 설치시작·완료 카드(담당 운수사만)·협의사항 카드(전원)를 보내는 주소다.
// 저장값이 없으면 환경변수의 기본 4명(김준영·황문환·김기훈·이경호)을 쓴다.
export default function InspectorManager() {
  const [rows, setRows] = useState<Row[] | null>(null); // null = 로딩 중
  const [isDefault, setIsDefault] = useState(true);
  const [defaults, setDefaults] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/inspectors", { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "불러오기 실패");
        setRows(j.list as Row[]);
        setIsDefault(!!j.isDefault);
        setDefaults(j.defaults ?? []);
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
  const update = (i: number, patch: Partial<Row>) => {
    setRows((r) => (r ? r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) : r));
    touch();
  };
  const remove = (i: number) => {
    if (!confirm(`${rows?.[i]?.name || "이 검수자"}를 목록에서 뺄까요? 이후 설치시작 보고에서 담당자로 고를 수 없습니다.`)) return;
    setRows((r) => (r ? r.filter((_, idx) => idx !== i) : r));
    touch();
  };
  const add = () => {
    setRows((r) => [...(r ?? []), { name: "", url: "" }]);
    touch();
  };

  async function save() {
    if (!rows || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/inspectors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list: rows }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "저장 실패");
      setRows(j.list);
      setIsDefault(false);
      setDirty(false);
      setMsg({ ok: true, text: "저장했습니다. 설치시작 보고 담당자 선택과 팀즈 개인방 발송에 바로 적용됩니다." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "저장 실패" });
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!confirm("기본 검수자(환경변수 4명)로 되돌릴까요? 여기서 추가한 검수자는 사라집니다.")) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/inspectors", { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "초기화 실패");
      setRows(j.list);
      setIsDefault(true);
      setDirty(false);
      setMsg({ ok: true, text: "기본 검수자로 되돌렸습니다." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "초기화 실패" });
    } finally {
      setSaving(false);
    }
  }

  if (!rows) return <p className="py-6 text-center text-sm text-gray-400">{msg?.text ?? "불러오는 중…"}</p>;

  const input = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
        <p className="font-semibold text-blue-700">검수자와 팀즈 개인 채팅방을 관리합니다</p>
        <p className="mt-1">
          이름은 설치시작 보고의 담당자 선택 버튼이 되고, 웹훅 주소로 그 검수자 개인방에 설치시작·완료 카드(담당 운수사만)와
          협의사항 카드(전원)가 갑니다. 공용방 발송은 그대로입니다.{" "}
          {isDefault ? `지금은 기본 검수자(${defaults.join("·") || "환경변수"})입니다.` : "현재 이 프로젝트 전용 목록이 적용돼 있습니다."}
        </p>
        <p className="mt-1 text-[11px] text-gray-500">
          웹훅 주소는 팀즈 워크플로 「웹후크 요청을 받는 경우 채팅에 게시」로 만든 https:// 주소입니다. 방을 만든 관리자가 그 방을 나가면 발송이 조용히 실패하니 나가지 말고 음소거하세요.
        </p>
      </div>

      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <input
                value={r.name}
                maxLength={20}
                placeholder="검수자 이름"
                onChange={(e) => update(i, { name: e.target.value })}
                className={`${input} flex-1`}
              />
              {defaults.includes(r.name) && isDefault && (
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">기본</span>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-600 active:bg-red-50"
              >
                삭제
              </button>
            </div>
            <input
              value={r.url}
              placeholder="팀즈 개인방 웹훅 주소 (https://…)"
              onChange={(e) => update(i, { url: e.target.value })}
              className={`${input} mt-2 font-mono text-xs`}
            />
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={add}
        disabled={rows.length >= 30}
        className="w-full rounded-lg border border-dashed border-blue-300 py-2.5 text-sm font-semibold text-blue-600 active:bg-blue-50 disabled:opacity-40"
      >
        + 검수자 추가
      </button>

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
          기본 4명으로
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-40"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
