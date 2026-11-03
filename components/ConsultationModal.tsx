"use client";

import { useState } from "react";
import type { OperatorSchedule } from "@/lib/stats";
import { noteBullet } from "@/lib/report";
import {
  CONSULT_META,
  childVisible,
  consultTitle,
  type ConsultField,
} from "@/lib/consultation-form";

const INPUT =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const LABEL = "text-[11px] font-medium text-gray-500";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0"),
); // 5분 단위

const CUSTOM = "직접입력"; // 선택지에 이 값이 있으면 고를 때 직접 입력란이 열린다

// "2026-07-15" → "2026.07.15"
function fmtDot(d: string): string {
  return d.replace(/-/g, ".");
}

// 카드 미리보기의 항목 한 줄 (팀즈 FactSet 모양)
function PreviewRow({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-28 shrink-0 font-semibold text-gray-500">{title}</span>
      <span className="min-w-0 break-words text-gray-800">{value}</span>
    </div>
  );
}

function PreviewSub({ text }: { text: string }) {
  return <p className="mt-2 text-xs font-bold text-gray-800">{text}</p>;
}

// 시/분 드롭다운 — 작업 시간·도착 예정·익일 첫차·차고지 출발 공용.
// 시를 고르면 분은 00으로 시작, 시를 '--'로 되돌리면 값 없음.
function TimeField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string; // "HH:MM" 또는 ""
  onChange: (v: string) => void;
  suffix?: string;
}) {
  const [h, m] = value ? value.split(":") : ["", "00"];
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <div className="mt-1 flex items-center gap-1.5">
        <select
          value={h}
          onChange={(e) => {
            const nh = e.target.value;
            onChange(nh ? `${nh}:${m || "00"}` : "");
          }}
          className="rounded-lg border border-gray-300 px-2 py-2 text-base focus:border-blue-500 focus:outline-none"
        >
          <option value="">--</option>
          {HOURS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500">시</span>
        <select
          value={h ? m : ""}
          disabled={!h}
          onChange={(e) => {
            if (h) onChange(`${h}:${e.target.value}`);
          }}
          className="rounded-lg border border-gray-300 px-2 py-2 text-base focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
        >
          {!h && <option value="">--</option>}
          {MINUTES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500">분</span>
        {suffix && value && (
          <span className="text-xs font-semibold text-blue-600">{suffix}</span>
        )}
      </div>
    </label>
  );
}

// 운수사 검색 콤보박스 — 목록 항목 클릭으로만 선택 성립(없는 운수사 입력 불가).
function OperatorCombobox({
  operators,
  selected,
  onSelect,
}: {
  operators: OperatorSchedule[];
  selected: OperatorSchedule | null;
  onSelect: (op: OperatorSchedule | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const filtered = operators.filter((o) => o.operator.includes(query.trim()));

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        placeholder="운수사명 검색"
        onChange={(e) => {
          setQuery(e.target.value);
          setListOpen(true);
          // 타이핑으로 선택값과 달라지면 선택 무효화(일정·대수도 함께 초기화됨)
          if (selected && e.target.value !== selected.operator) onSelect(null);
        }}
        onFocus={() => setListOpen(true)}
        onBlur={() => {
          setListOpen(false);
          // 목록에서 고르지 않은 문자열은 값이 되지 않음
          setQuery(selected ? selected.operator : "");
        }}
        className={INPUT}
      />
      {listOpen && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-gray-400">
              일치하는 운수사가 없습니다
            </li>
          ) : (
            filtered.map((o) => (
              <li key={o.operator}>
                <button
                  type="button"
                  // blur가 클릭보다 먼저 발생해 목록이 닫히는 것 방지
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(o);
                    setQuery(o.operator);
                    setListOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blue-50"
                >
                  <span className="min-w-0 truncate font-medium text-gray-700">
                    {o.operator}
                  </span>
                  <span className="shrink-0 text-[11px] text-gray-400">
                    {o.dates.reduce((s, d) => s + d.count, 0)}대
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// 항목 기본값 — 양식 메타의 preset (예: 표출기 "기존 위치")
function initialValues(fields: ConsultField[]): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of fields) v[f.key] = CONSULT_META[f.key]?.preset ?? "";
  return v;
}

// '운수사 협의사항' 버튼 → 팝업 폼 → 팀즈(사진 전송 채팅방) 카드 전송.
// 항목·선택지·순서는 프로젝트 양식(fields, 관리자 '협의사항 양식' 탭)을 따른다.
// 운수사·설치일만 필수, 나머지는 미입력 시 카드에 '-'로 표기(협의 진행 중 초안 공유 허용).
export default function ConsultationModal({
  operators,
  fields,
}: {
  operators: OperatorSchedule[];
  fields: ConsultField[];
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(true); // DB 저장 성공 여부(전송과 별개)
  const [previewOpen, setPreviewOpen] = useState(false); // 모바일 미리보기 토글(PC는 항상 표시)

  const [selectedOp, setSelectedOp] = useState<OperatorSchedule | null>(null);
  const [date, setDate] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(fields));
  const [custom, setCustom] = useState<Record<string, string>>({}); // '직접입력' 선택 시 입력한 내용

  // '차량리스트 보기' 팝업 — 버튼 클릭 시 운수사·날짜에 맞는 차량번호를 조회해 별도 팝업으로 표시
  const [vehOpen, setVehOpen] = useState(false);
  const [vehLoading, setVehLoading] = useState(false);
  const [vehError, setVehError] = useState<string | null>(null);
  const [vehList, setVehList] = useState<{ plate: string; route: string }[]>(
    [],
  );

  const count = selectedOp?.dates.find((d) => d.date === date)?.count ?? 0;
  // 선택한 날짜에 설치하는 노선별 대수 (자동 표기·카드에도 포함)
  const routes = selectedOp?.dates.find((d) => d.date === date)?.routes ?? [];
  const routesText = routes.map((r) => `${r.route} ${r.count}대`).join(" · ");

  const active = fields.filter((f) => f.enabled);
  // 카드에 실리는 최종 값 — '직접입력'이면 입력한 내용
  const finalValue = (f: ConsultField) =>
    (values[f.key] === CUSTOM && f.options?.includes(CUSTOM) ? custom[f.key] ?? "" : values[f.key] ?? "").trim();
  const finals: Record<string, string> = {};
  for (const f of active) if (f.type !== "heading") finals[f.key] = finalValue(f);
  const visible = (f: ConsultField) => childVisible(f.key, fields, values);

  const setValue = (key: string, v: string) =>
    setValues((prev) => {
      const next = { ...prev, [key]: v };
      // 종속 항목이 숨겨지면 적힌 값도 비운다 — 숨기기만 하면 그대로 전송된다
      for (const f of fields) if (!childVisible(f.key, fields, next)) next[f.key] = "";
      return next;
    });

  function reset() {
    setStep("form");
    setBusy(false);
    setError(null);
    setSelectedOp(null);
    setDate("");
    setValues(initialValues(fields));
    setCustom({});
    setVehOpen(false);
    setVehLoading(false);
    setVehError(null);
    setVehList([]);
    setPreviewOpen(false);
  }

  async function openVehicleList() {
    if (!selectedOp || !date) return;
    setVehOpen(true);
    setVehLoading(true);
    setVehError(null);
    try {
      const res = await fetch(
        `/api/consultation/vehicles?operator=${encodeURIComponent(selectedOp.operator)}&date=${date}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "조회 실패");
      setVehList(json.vehicles ?? []);
    } catch (e) {
      setVehError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setVehLoading(false);
    }
  }

  function close() {
    setOpen(false);
    reset();
  }

  // 운수사 선택 시 예정일이 하나면 자동 선택
  function handleSelectOp(op: OperatorSchedule | null) {
    setSelectedOp(op);
    setDate(op && op.dates.length === 1 ? op.dates[0].date : "");
  }

  async function handleSend() {
    if (!selectedOp || !date) return;
    if (!operators.some((o) => o.operator === selectedOp.operator)) return;
    for (const f of active) {
      if (f.type === "heading" || !visible(f)) continue;
      if (values[f.key] === CUSTOM && f.options?.includes(CUSTOM) && !finals[f.key]) {
        setError(`${consultTitle(f)}의 직접입력 내용을 입력하세요.`);
        return;
      }
    }
    // 변동사항처럼 부모가 '해당'일 때 열리는 항목은 비우면 안 된다
    const lc = active.find((f) => f.key === "list_change");
    const lcParent = fields.find((f) => f.key === "list_check");
    // 부모가 꺼져 있으면 변동사항은 그냥 자유 입력란(항상 표시) — 필수 아님
    if (lc && lcParent?.enabled && lcParent.options?.[1] && visible(lc) && !finals.list_change) {
      setError(`${consultTitle(lc)} 내용을 입력하세요.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operator: selectedOp.operator,
          date,
          count,
          routes: routesText,
          values: finals,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "전송 실패");
      setSavedOk(json.saved !== false);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setBusy(false);
    }
  }

  // 양식 항목 하나의 입력 UI
  function renderField(f: ConsultField) {
    const meta = CONSULT_META[f.key];
    if (f.type === "heading") {
      return (
        <p key={f.key} className="pt-1 text-xs font-bold text-gray-700">
          ○ {f.label}
        </p>
      );
    }
    if (!visible(f)) return null;
    if (f.type === "time") {
      return (
        <TimeField
          key={f.key}
          label={f.label}
          value={values[f.key] ?? ""}
          onChange={(v) => setValue(f.key, v)}
          suffix={meta?.suffix}
        />
      );
    }
    if (f.type === "textarea") {
      return (
        <label key={f.key} className="block">
          <span className={LABEL}>{f.label}</span>
          <textarea
            value={values[f.key] ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
            rows={3}
            placeholder={meta?.placeholder}
            className={INPUT}
          />
        </label>
      );
    }
    if (f.options && f.options.length > 0) {
      return (
        <label key={f.key} className="block">
          <span className={LABEL}>{f.label}</span>
          <select
            value={values[f.key] ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
            className={INPUT}
          >
            <option value="">선택</option>
            {f.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {values[f.key] === CUSTOM && (
            <input
              type="text"
              value={custom[f.key] ?? ""}
              onChange={(e) => setCustom((c) => ({ ...c, [f.key]: e.target.value }))}
              placeholder={meta?.placeholder ?? "직접 입력"}
              className={INPUT}
            />
          )}
        </label>
      );
    }
    return (
      <label key={f.key} className="block">
        <span className={LABEL}>{f.label}</span>
        <input
          type="text"
          value={values[f.key] ?? ""}
          onChange={(e) => setValue(f.key, e.target.value)}
          placeholder={meta?.placeholder}
          className={INPUT}
        />
      </label>
    );
  }

  // 카드 미리보기 한 줄 — 서버 카드(lib/teams.ts sendConsultationCard)와 같은 규칙
  function renderPreview(f: ConsultField) {
    if (f.type === "heading") return <PreviewSub key={f.key} text={`○ ${f.label}`} />;
    if (!visible(f)) return null;
    const val = finals[f.key] ?? "";
    if (f.type === "textarea") {
      const lines = val ? val.split(/\r?\n/).map(noteBullet).filter(Boolean) : ["- 없음"];
      return (
        <div key={f.key} className="text-gray-800">
          {lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      );
    }
    const meta = CONSULT_META[f.key];
    if (meta?.hideEmpty && !val) return null;
    return (
      <PreviewRow
        key={f.key}
        title={consultTitle(f)}
        value={val ? (meta?.suffix ? `${val} ${meta.suffix}` : val) : "-"}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm transition-colors hover:bg-red-50"
      >
        운수사 협의사항
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="mb-12 mt-8 w-full max-w-md rounded-2xl bg-white shadow-xl md:max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-bold text-blue-700">
                {step === "done" ? "전송 완료" : "운수사 협의사항"}
              </h2>
              <button
                onClick={close}
                className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              {step === "done" ? (
                <div className="py-6 text-center">
                  <p className="text-3xl">✅</p>
                  <p className="mt-2 text-sm font-semibold text-gray-700">
                    팀즈로 전송했습니다
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    [{fmtDot(date)} 설치 일정] {selectedOp?.operator}
                  </p>
                  {!savedOk && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                      전송은 완료됐지만 DB 저장은 되지 않았습니다. (관리자에게
                      문의 — 마이그레이션 필요)
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={close}
                    className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white active:bg-blue-700"
                  >
                    확인
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    {/* 제목 미리보기 — 설치일 선택 시 자동 표기 */}
                    <p className="rounded-lg bg-blue-50 px-3 py-2 text-center text-sm font-bold text-blue-700">
                      [{date ? fmtDot(date) : "0000.00.00"} 설치 일정]
                    </p>

                    <div>
                      <span className={LABEL}>1. 운수사</span>
                      <OperatorCombobox
                        operators={operators}
                        selected={selectedOp}
                        onSelect={handleSelectOp}
                      />
                    </div>

                    {selectedOp &&
                      (selectedOp.dates.length === 0 ? (
                        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-400">
                          이 운수사는 설치 예정일 데이터가 없어 전송할 수
                          없습니다.
                        </p>
                      ) : (
                        <label className="block">
                          <span className={LABEL}>
                            설치 일정 (엑셀 예정일 기준)
                          </span>
                          <select
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className={INPUT}
                          >
                            <option value="">날짜 선택</option>
                            {selectedOp.dates.map((d) => (
                              <option key={d.date} value={d.date}>
                                {fmtDot(d.date)} ({d.count}대)
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}

                    {selectedOp && date && (
                      <button
                        type="button"
                        onClick={openVehicleList}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        🚌 차량리스트 보기 ({count}대)
                      </button>
                    )}

                    <div>
                      <span className={LABEL}>2. 설치 대수 (자동 표기)</span>
                      <p className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">
                        {date ? `${count}대` : "-"}
                      </p>
                    </div>

                    {date && routes.length > 0 && (
                      <div>
                        <span className={LABEL}>설치 노선 (자동 표기)</span>
                        <p className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-700">
                          {routesText}
                        </p>
                      </div>
                    )}

                    {active.map(renderField)}

                    {error && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                        {error}
                      </p>
                    )}

                    <p className="text-[11px] text-gray-400">
                      운수사·설치 일정만 필수입니다. 입력하지 않은 항목은 카드에
                      &quot;-&quot;로 표기됩니다.
                    </p>

                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!selectedOp || !date || busy}
                      className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white active:bg-blue-700 disabled:opacity-50"
                    >
                      {busy ? "전송 중..." : "팀즈로 보내기"}
                    </button>

                    {/* 모바일 전용 — 미리보기 토글 버튼 (PC는 오른쪽에 항상 표시) */}
                    <button
                      type="button"
                      onClick={() => setPreviewOpen((v) => !v)}
                      className="w-full rounded-xl border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-600 active:bg-gray-50 md:hidden"
                    >
                      {previewOpen ? "미리보기 닫기 ▲" : "카드 미리보기 ▼"}
                    </button>
                  </div>

                  {/* 카드 미리보기 — 입력하면 실시간 반영 (PC: 오른쪽 항상, 모바일: 버튼으로 토글) */}
                  <div
                    className={`h-fit rounded-xl border border-gray-200 bg-gray-50 p-3 md:sticky md:top-2 md:block ${previewOpen ? "" : "hidden"}`}
                  >
                    <p className="mb-2 text-[11px] font-semibold text-gray-400">
                      카드 미리보기 (팀즈 협의사항방)
                    </p>
                    <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs leading-relaxed shadow-sm">
                      <p className="text-sm font-bold text-gray-900">
                        📋 [{date ? fmtDot(date) : "0000.00.00"} 설치 일정]
                        운수사 협의사항
                      </p>
                      <p className="font-bold text-blue-600">
                        {selectedOp?.operator ?? "운수사 미선택"} ·{" "}
                        {date ? count : 0}대
                      </p>
                      <div className="mt-1.5">
                        <PreviewRow
                          title="운수사"
                          value={selectedOp?.operator ?? "-"}
                        />
                        <PreviewRow
                          title="설치 대수"
                          value={date ? `${count}대` : "-"}
                        />
                        <PreviewRow
                          title="설치 노선"
                          value={routesText || "-"}
                        />
                        {active.map(renderPreview)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 차량리스트 팝업 — 협의사항 팝업 위에 겹쳐서 표시 */}
      {vehOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setVehOpen(false)}
        >
          <div
            className="mb-12 mt-16 w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="min-w-0 truncate text-sm font-bold text-blue-700">
                차량리스트 — {selectedOp?.operator} {date && fmtDot(date)}
              </h2>
              <button
                onClick={() => setVehOpen(false)}
                className="shrink-0 rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-4">
              {vehLoading ? (
                <p className="py-6 text-center text-xs text-gray-400">
                  불러오는 중…
                </p>
              ) : vehError ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  {vehError}
                </p>
              ) : vehList.length === 0 ? (
                <p className="py-6 text-center text-xs text-gray-400">
                  해당 날짜의 차량이 없습니다.
                </p>
              ) : (
                (() => {
                  // 노선별로 묶어서 표시
                  const groups = new Map<string, string[]>();
                  for (const v of vehList) {
                    const r = v.route?.trim() || "미지정";
                    groups.set(r, [...(groups.get(r) ?? []), v.plate]);
                  }
                  return (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-gray-600">
                        총 {vehList.length}대
                      </p>
                      {[...groups.entries()].map(([route, plates]) => (
                        <div key={route}>
                          <p className="text-[11px] font-semibold text-blue-700">
                            {route}{" "}
                            <span className="font-normal text-gray-400">
                              {plates.length}대
                            </span>
                          </p>
                          <ul className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1">
                            {plates.map((p) => (
                              <li
                                key={p}
                                className="rounded bg-gray-50 px-2 py-1 text-xs text-gray-700"
                              >
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>

            <div className="border-t border-gray-100 p-4">
              <button
                type="button"
                onClick={() => setVehOpen(false)}
                className="w-full rounded-xl bg-gray-600 py-2.5 text-sm font-bold text-white active:bg-gray-700"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
