"use client";

import { useState } from "react";
import type { OperatorSchedule } from "@/lib/stats";

const INPUT =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const LABEL = "text-[11px] font-medium text-gray-500";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0")); // 5분 단위

const KEY_OPTIONS = ["차량 내 보관", "배차실 수령", "직접입력"];
const ENGINE_OPTIONS = ["가능", "불가능"];
const FUEL_OPTIONS = ["가스 충분", "부족(에어컨 조절 필요)"];
const MOUNT_MAIN_OPTIONS = ["운전석 위", "직접입력"];
const MOUNT_BOARD_OPTIONS = ["격벽 ㄷ봉 사용", "표출기 뒤", "직접입력"];
const HANDLE_REMOVAL_OPTIONS = ["가능(탈거후 정비과 반납요청)", "불가능"];

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

// 시/분 드롭다운 — 작업 시간(4)·도착 예정(7)·익일 첫차(8)·차고지 출발(9) 공용.
// 시를 고르면 분은 00으로 시작, 시를 '--'로 되돌리면 값 없음(null).
function TimeField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string | null; // "HH:MM" 또는 null
  onChange: (v: string | null) => void;
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
            onChange(nh ? `${nh}:${m || "00"}` : null);
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

// 옵션 드롭다운 + '직접입력' 선택 시 텍스트 입력 노출 — 차키(10)·통합단말기·승차(14) 공용.
function OptionField({
  label,
  options,
  value,
  onChange,
  custom,
  onCustomChange,
  placeholder,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  custom: string;
  onCustomChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
        <option value="">선택</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {value === "직접입력" && (
        <input
          type="text"
          value={custom}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder={placeholder ?? "직접 입력"}
          className={INPUT}
        />
      )}
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
            <li className="px-3 py-2 text-xs text-gray-400">일치하는 운수사가 없습니다</li>
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

// '운수사 협의사항' 버튼 → 팝업 폼 → 팀즈(사진 전송 채팅방) 카드 전송.
// 운수사·설치일만 필수, 나머지는 미입력 시 카드에 '-'로 표기(협의 진행 중 초안 공유 허용).
export default function ConsultationModal({ operators }: { operators: OperatorSchedule[] }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(true); // DB 저장 성공 여부(전송과 별개)
  const [previewOpen, setPreviewOpen] = useState(false); // 모바일 미리보기 토글(PC는 항상 표시)

  const [selectedOp, setSelectedOp] = useState<OperatorSchedule | null>(null);
  const [date, setDate] = useState("");
  const [place, setPlace] = useState("");
  const [workStart, setWorkStart] = useState<string | null>(null);
  const [dayOff, setDayOff] = useState("");
  const [nextDayOff, setNextDayOff] = useState("");
  const [arrival, setArrival] = useState<string | null>(null);
  const [nextFirstBus, setNextFirstBus] = useState<string | null>(null);
  const [depotOut, setDepotOut] = useState<string | null>(null);
  const [keyOpt, setKeyOpt] = useState("");
  const [keyCustom, setKeyCustom] = useState("");
  const [engineOn, setEngineOn] = useState("");
  const [fuel, setFuel] = useState("");
  const [managerDay, setManagerDay] = useState("");
  const [managerNight, setManagerNight] = useState("");
  const [mountDisplay, setMountDisplay] = useState("기존 위치");
  const [mountMainOpt, setMountMainOpt] = useState("");
  const [mountMainCustom, setMountMainCustom] = useState("");
  const [mountBoardOpt, setMountBoardOpt] = useState("");
  const [mountBoardCustom, setMountBoardCustom] = useState("");
  const [handleRemoval, setHandleRemoval] = useState("");
  const [listCheck, setListCheck] = useState(""); // 차량리스트·수량 확인 (이상 없음/변동 있음)
  const [listChange, setListChange] = useState(""); // 변동 있음일 때 변동사항
  const [notes, setNotes] = useState("");
  const [consulter, setConsulter] = useState("");

  // '차량리스트 보기' 팝업 — 버튼 클릭 시 운수사·날짜에 맞는 차량번호를 조회해 별도 팝업으로 표시
  const [vehOpen, setVehOpen] = useState(false);
  const [vehLoading, setVehLoading] = useState(false);
  const [vehError, setVehError] = useState<string | null>(null);
  const [vehList, setVehList] = useState<{ plate: string; route: string }[]>([]);

  const count = selectedOp?.dates.find((d) => d.date === date)?.count ?? 0;
  // 선택한 날짜에 설치하는 노선별 대수 (자동 표기·카드에도 포함)
  const routes = selectedOp?.dates.find((d) => d.date === date)?.routes ?? [];
  const routesText = routes.map((r) => `${r.route} ${r.count}대`).join(" · ");

  function reset() {
    setStep("form");
    setBusy(false);
    setError(null);
    setSelectedOp(null);
    setDate("");
    setPlace("");
    setWorkStart(null);
    setDayOff("");
    setNextDayOff("");
    setArrival(null);
    setNextFirstBus(null);
    setDepotOut(null);
    setKeyOpt("");
    setKeyCustom("");
    setEngineOn("");
    setFuel("");
    setManagerDay("");
    setManagerNight("");
    setMountDisplay("기존 위치");
    setMountMainOpt("");
    setMountMainCustom("");
    setMountBoardOpt("");
    setMountBoardCustom("");
    setHandleRemoval("");
    setListCheck("");
    setListChange("");
    setNotes("");
    setConsulter("");
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
    if (keyOpt === "직접입력" && !keyCustom.trim()) {
      setError("차키 협조의 직접입력 내용을 입력하세요.");
      return;
    }
    if (mountMainOpt === "직접입력" && !mountMainCustom.trim()) {
      setError("통합단말기 위치의 직접입력 내용을 입력하세요.");
      return;
    }
    if (mountBoardOpt === "직접입력" && !mountBoardCustom.trim()) {
      setError("승차 단말기 위치의 직접입력 내용을 입력하세요.");
      return;
    }
    if (listCheck === "변동 있음" && !listChange.trim()) {
      setError("차량리스트 변동사항 내용을 입력하세요.");
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
          listCheck,
          listChange: listCheck === "변동 있음" ? listChange : "",
          place,
          workStart: workStart ?? "",
          dayOff,
          nextDayOff,
          arrival: arrival ?? "",
          nextFirstBus: nextFirstBus ?? "",
          depotOut: depotOut ?? "",
          keyMethod: keyOpt === "직접입력" ? keyCustom : keyOpt,
          engineOn,
          fuel,
          managerDay,
          managerNight,
          mountDisplay,
          mountMain: mountMainOpt === "직접입력" ? mountMainCustom : mountMainOpt,
          mountBoard: mountBoardOpt === "직접입력" ? mountBoardCustom : mountBoardOpt,
          handleRemoval,
          notes,
          consulter,
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
                      전송은 완료됐지만 DB 저장은 되지 않았습니다. (관리자에게 문의 —
                      마이그레이션 필요)
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
                        이 운수사는 설치 예정일 데이터가 없어 전송할 수 없습니다.
                      </p>
                    ) : (
                      <label className="block">
                        <span className={LABEL}>설치 일정 (엑셀 예정일 기준)</span>
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

                  <label className="block">
                    <span className={LABEL}>차량리스트·수량 확인</span>
                    <select
                      value={listCheck}
                      onChange={(e) => setListCheck(e.target.value)}
                      className={INPUT}
                    >
                      <option value="">선택</option>
                      <option value="이상 없음">이상 없음</option>
                      <option value="변동 있음">변동 있음</option>
                    </select>
                    {listCheck === "변동 있음" && (
                      <input
                        type="text"
                        value={listChange}
                        onChange={(e) => setListChange(e.target.value)}
                        placeholder="변동사항 입력 (예: 차량 교체·추가·제외)"
                        className={INPUT}
                      />
                    )}
                  </label>

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

                  <label className="block">
                    <span className={LABEL}>3. 설치 장소</span>
                    <input
                      type="text"
                      value={place}
                      onChange={(e) => setPlace(e.target.value)}
                      placeholder="주소 입력"
                      className={INPUT}
                    />
                  </label>

                  <TimeField
                    label="4. 작업 시간 (첫차 운행 종료 시간)"
                    value={workStart}
                    onChange={setWorkStart}
                    suffix="이후부터 가능"
                  />

                  <label className="block">
                    <span className={LABEL}>5. 당일 휴차</span>
                    <input
                      type="text"
                      value={dayOff}
                      onChange={(e) => setDayOff(e.target.value)}
                      placeholder="차량번호 입력"
                      className={INPUT}
                    />
                  </label>

                  <label className="block">
                    <span className={LABEL}>6. 익일 휴차</span>
                    <input
                      type="text"
                      value={nextDayOff}
                      onChange={(e) => setNextDayOff(e.target.value)}
                      placeholder="차량번호 입력"
                      className={INPUT}
                    />
                  </label>

                  <TimeField
                    label="7. 첫차 운행 종료 후 도착 예정 시간"
                    value={arrival}
                    onChange={setArrival}
                  />

                  <TimeField
                    label="8. 익일 첫차 출발"
                    value={nextFirstBus}
                    onChange={setNextFirstBus}
                  />

                  <TimeField
                    label="9. 차고지에서 나가는 시간 (첫차 기준)"
                    value={depotOut}
                    onChange={setDepotOut}
                  />

                  <OptionField
                    label="10. 차키 협조"
                    options={KEY_OPTIONS}
                    value={keyOpt}
                    onChange={setKeyOpt}
                    custom={keyCustom}
                    onCustomChange={setKeyCustom}
                  />

                  <label className="block">
                    <span className={LABEL}>11. 작업 중 차량 시동 가능 여부</span>
                    <select
                      value={engineOn}
                      onChange={(e) => setEngineOn(e.target.value)}
                      className={INPUT}
                    >
                      <option value="">선택</option>
                      {ENGINE_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className={LABEL}>12. 확인사항 · 충전 여부</span>
                    <select
                      value={fuel}
                      onChange={(e) => setFuel(e.target.value)}
                      className={INPUT}
                    >
                      <option value="">선택</option>
                      {FUEL_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div>
                    <span className={LABEL}>13. 운수사 담당자</span>
                    <input
                      type="text"
                      value={managerDay}
                      onChange={(e) => setManagerDay(e.target.value)}
                      placeholder="주간 — 이름/연락처"
                      className={INPUT}
                    />
                    <input
                      type="text"
                      value={managerNight}
                      onChange={(e) => setManagerNight(e.target.value)}
                      placeholder="야간 — 이름/연락처"
                      className={INPUT}
                    />
                  </div>

                  <div className="space-y-2">
                    <span className={LABEL}>14. 단말기 설치 위치 (협의)</span>
                    <label className="block">
                      <span className="text-[11px] text-gray-400">표출기</span>
                      <input
                        type="text"
                        value={mountDisplay}
                        onChange={(e) => setMountDisplay(e.target.value)}
                        className={INPUT}
                      />
                    </label>
                    <OptionField
                      label="통합단말기"
                      options={MOUNT_MAIN_OPTIONS}
                      value={mountMainOpt}
                      onChange={setMountMainOpt}
                      custom={mountMainCustom}
                      onCustomChange={setMountMainCustom}
                      placeholder="설치 위치 직접 입력"
                    />
                    <OptionField
                      label="승차"
                      options={MOUNT_BOARD_OPTIONS}
                      value={mountBoardOpt}
                      onChange={setMountBoardOpt}
                      custom={mountBoardCustom}
                      onCustomChange={setMountBoardCustom}
                      placeholder="설치 위치 직접 입력"
                    />
                    <label className="block">
                      <span className={LABEL}>격벽 손잡이(얇은봉) 탈거 유무</span>
                      <select
                        value={handleRemoval}
                        onChange={(e) => setHandleRemoval(e.target.value)}
                        className={INPUT}
                      >
                        <option value="">선택</option>
                        {HANDLE_REMOVAL_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="block">
                    <span className={LABEL}>15. 특이사항</span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="협의 중 나온 특이사항"
                      className={INPUT}
                    />
                  </label>

                  <label className="block">
                    <span className={LABEL}>16. 협의자</span>
                    <input
                      type="text"
                      value={consulter}
                      onChange={(e) => setConsulter(e.target.value)}
                      placeholder="이름/연락처"
                      className={INPUT}
                    />
                  </label>

                  {error && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                      {error}
                    </p>
                  )}

                  <p className="text-[11px] text-gray-400">
                    운수사·설치 일정만 필수입니다. 입력하지 않은 항목은 카드에 &quot;-&quot;로
                    표기됩니다.
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
                      📋 [{date ? fmtDot(date) : "0000.00.00"} 설치 일정] 운수사 협의사항
                    </p>
                    <p className="font-bold text-blue-600">
                      {selectedOp?.operator ?? "운수사 미선택"} · {date ? count : 0}대
                    </p>
                    <div className="mt-1.5">
                      <PreviewRow title="운수사" value={selectedOp?.operator ?? "-"} />
                      <PreviewRow title="설치 대수" value={date ? `${count}대` : "-"} />
                      <PreviewRow title="설치 노선" value={routesText || "-"} />
                      <PreviewRow title="차량리스트 확인" value={listCheck.trim() || "-"} />
                      {listCheck === "변동 있음" && listChange.trim() && (
                        <PreviewRow title="변동사항" value={listChange.trim()} />
                      )}
                      <PreviewRow title="설치 장소" value={place.trim() || "-"} />
                      <PreviewRow
                        title="작업 시간"
                        value={workStart ? `${workStart} 이후부터 가능` : "-"}
                      />
                      <PreviewRow title="당일 휴차" value={dayOff.trim() || "-"} />
                      <PreviewRow title="익일 휴차" value={nextDayOff.trim() || "-"} />
                    </div>
                    <PreviewSub text="○ 차량 운행 시간" />
                    <PreviewRow title="첫차 종료 후 도착" value={arrival ?? "-"} />
                    <PreviewRow title="익일 첫차 출발" value={nextFirstBus ?? "-"} />
                    <PreviewRow title="차고지 출발(첫차)" value={depotOut ?? "-"} />
                    <PreviewSub text="○ 협조·확인사항" />
                    <PreviewRow
                      title="차키 협조"
                      value={(keyOpt === "직접입력" ? keyCustom : keyOpt).trim() || "-"}
                    />
                    <PreviewRow title="작업 중 시동" value={engineOn.trim() || "-"} />
                    <PreviewRow title="충전 여부" value={fuel.trim() || "-"} />
                    <PreviewSub text="○ 담당자·단말기 설치 위치" />
                    <PreviewRow title="담당자(주간)" value={managerDay.trim() || "-"} />
                    <PreviewRow title="담당자(야간)" value={managerNight.trim() || "-"} />
                    <PreviewRow title="표출기" value={mountDisplay.trim() || "-"} />
                    <PreviewRow
                      title="통합단말기"
                      value={(mountMainOpt === "직접입력" ? mountMainCustom : mountMainOpt).trim() || "-"}
                    />
                    <PreviewRow
                      title="승차"
                      value={(mountBoardOpt === "직접입력" ? mountBoardCustom : mountBoardOpt).trim() || "-"}
                    />
                    <PreviewRow title="격벽 손잡이 탈거" value={handleRemoval.trim() || "-"} />
                    <PreviewSub text="○ 특이사항" />
                    <div className="text-gray-800">
                      {(notes.trim()
                        ? notes
                            .trim()
                            .split(/\r?\n/)
                            .map((l) => l.trim())
                            .filter(Boolean)
                            .map((l) => (l.startsWith("-") ? l : `- ${l}`))
                        : ["- 없음"]
                      ).map((l, i) => (
                        <p key={i}>{l}</p>
                      ))}
                    </div>
                    <div className="mt-1.5">
                      <PreviewRow title="협의자" value={consulter.trim() || "-"} />
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
                <p className="py-6 text-center text-xs text-gray-400">불러오는 중…</p>
              ) : vehError ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{vehError}</p>
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
                            {route} <span className="font-normal text-gray-400">{plates.length}대</span>
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
