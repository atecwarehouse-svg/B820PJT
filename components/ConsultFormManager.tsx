"use client";

import { useEffect, useState } from "react";
import { CONSULT_CHILD, type ConsultField } from "@/lib/consultation-form";

// 운수사 협의사항 폼 양식 관리 — 관리자 페이지 '협의사항 양식' 탭 (app_settings.consult_form, 프로젝트별).
// 항목명·카드 표기·선택지·사용 여부·순서를 바꾼다. 항목 추가는 DB 컬럼이 필요해 미지원(이름을 바꿔 쓰는 방식).
//   - 선택지가 있으면 드롭다운, 비우면 자유 입력. '직접입력'을 넣으면 고를 때 입력란이 열린다
//   - 변동사항·사전출발 차량번호는 부모 항목의 두 번째 선택지를 기준으로 보이거나 숨겨진다

const TYPE_LABEL: Record<ConsultField["type"], string> = {
  text: "입력",
  time: "시:분",
  textarea: "여러 줄",
  heading: "소제목",
};

export default function ConsultFormManager() {
  const [fields, setFields] = useState<ConsultField[] | null>(null); // null = 로딩 중
  // 선택지 입력칸의 원문 — 입력 중 쉼표로 쪼개 저장하면 끝의 쉼표·공백이 매 글자마다 지워져
  // 두 번째 선택지를 이어서 칠 수 없다. 원문은 그대로 보여주고 저장용 배열만 따로 만든다.
  const [optText, setOptText] = useState<Record<string, string>>({});
  const [isDefault, setIsDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/consult-form", { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "불러오기 실패");
        setFields(j.fields);
        setIsDefault(!!j.isDefault);
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "불러오기 실패" });
      }
    })();
  }, []);

  const update = (i: number, patch: Partial<ConsultField>) => {
    setFields((l) => (l ? l.map((f, j) => (j === i ? { ...f, ...patch } : f)) : l));
    setDirty(true);
    setMsg(null);
  };
  const move = (i: number, d: -1 | 1) => {
    setFields((l) => {
      if (!l) return l;
      const n = [...l];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
    setDirty(true);
    setMsg(null);
  };

  async function save() {
    if (!fields) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/consult-form", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "저장 실패");
      setFields(j.fields);
      setOptText({}); // 서버가 정리한 선택지(중복·공백 제거)로 다시 표시
      setIsDefault(!!j.isDefault);
      setDirty(false);
      setMsg({ ok: true, text: "저장했습니다. 협의사항 폼·팀즈 카드·설치계획 보고 카드에 바로 적용됩니다." });
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
      const res = await fetch("/api/admin/consult-form", { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "초기화 실패");
      setFields(j.fields);
      setOptText({});
      setIsDefault(true);
      setDirty(false);
      setMsg({ ok: true, text: "B820 기본 양식으로 되돌렸습니다." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "초기화 실패" });
    } finally {
      setSaving(false);
    }
  }

  if (!fields) return <p className="py-6 text-center text-sm text-gray-400">{msg?.text ?? "불러오는 중…"}</p>;

  const input = "min-w-0 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
        <p className="font-semibold text-blue-700">운수사 협의사항 폼의 항목·선택지를 이 프로젝트에 맞게 조정합니다</p>
        <p className="mt-1">
          항목명과 카드 표기(팀즈 카드·관리자 조회에 쓰는 짧은 이름)를 고치고, 선택지를 바꾸거나 비워 자유 입력으로
          만들 수 있습니다. 체크를 끄면 폼과 카드에서 숨겨집니다. 운수사·설치 일정·설치 대수·노선은 항상 표시됩니다.{" "}
          {isDefault ? "지금은 B820 기본 양식입니다." : "현재 이 프로젝트 전용 양식이 적용돼 있습니다."}
        </p>
        <p className="mt-1 text-[11px] text-gray-500">
          선택지는 쉼표(,)로 구분. 「직접입력」을 넣으면 고를 때 입력란이 열립니다. 변동사항은 차량리스트 확인의 두 번째
          선택지를 골랐을 때만 보이고, 사전출발 차량번호는 동시출발 여부의 두 번째 선택지를 고르면 숨겨집니다.
        </p>
      </div>

      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {fields.map((f, i) => {
          const child = CONSULT_CHILD[f.key];
          const parentOff = child && fields.some((p) => p.key === child.parent && !p.enabled);
          return (
            <li
              key={f.key}
              className={`flex flex-wrap items-center gap-2 px-3 py-2 ${f.type === "heading" ? "bg-gray-50" : ""} ${f.enabled ? "" : "opacity-60"}`}
            >
              <input
                type="checkbox"
                checked={f.enabled}
                onChange={(e) => update(i, { enabled: e.target.checked })}
                aria-label="사용"
                className="h-4 w-4"
              />
              <span className="w-10 shrink-0 rounded bg-gray-100 px-1 text-center text-[10px] text-gray-500">
                {TYPE_LABEL[f.type]}
              </span>
              <input
                value={f.label}
                maxLength={60}
                placeholder={f.type === "heading" ? "소제목" : "항목명"}
                onChange={(e) => update(i, { label: e.target.value })}
                className={`${input} flex-1 ${f.type === "heading" ? "font-semibold" : ""}`}
              />
              {f.type !== "heading" && (
                <input
                  value={f.title ?? ""}
                  maxLength={30}
                  placeholder="카드 표기(짧게)"
                  onChange={(e) => update(i, { title: e.target.value })}
                  className={`${input} w-36`}
                />
              )}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label="위로"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="rounded px-1.5 py-1 text-xs text-gray-500 active:bg-gray-100 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label="아래로"
                  disabled={i === fields.length - 1}
                  onClick={() => move(i, 1)}
                  className="rounded px-1.5 py-1 text-xs text-gray-500 active:bg-gray-100 disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
              {f.type === "text" && (
                <input
                  value={optText[f.key] ?? (f.options ?? []).join(", ")}
                  placeholder="선택지 (쉼표 구분 · 비우면 자유 입력)"
                  onChange={(e) => {
                    setOptText((t) => ({ ...t, [f.key]: e.target.value }));
                    update(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) });
                  }}
                  className={`${input} basis-full`}
                />
              )}
              {f.enabled && parentOff && (
                <span className="basis-full text-[11px] text-amber-700">
                  부모 항목이 꺼져 있어 항상 표시됩니다
                </span>
              )}
            </li>
          );
        })}
      </ul>

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
    </div>
  );
}
