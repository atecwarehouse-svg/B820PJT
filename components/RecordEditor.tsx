"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RecordBundle } from "@/lib/types";
import {
  AFTER_SLOTS,
  buildBeforeSlots,
  makeCustomSlotKey,
  type CustomSlot,
} from "@/lib/slots";
import { publicPhotoUrl } from "@/lib/photo-url";
import PhotoSlot from "@/components/PhotoSlot";

interface Props {
  plate: string;
  initial: RecordBundle;
}

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function RecordEditor({ plate, initial }: Props) {
  const vehicle = initial.vehicle!;
  const installDate = initial.record?.install_date ?? todayStr();

  const [operator, setOperator] = useState(
    initial.record?.operator ?? vehicle.operator,
  );
  const [route, setRoute] = useState(initial.record?.route ?? vehicle.route);
  // 연식·차종: 저장된 레코드값 우선, 없으면 차량 마스터(차량리스트 J/L열) 기본값. 수정 가능.
  const [year, setYear] = useState(initial.record?.year ?? vehicle.year ?? "");
  const [model, setModel] = useState(initial.record?.model ?? vehicle.model ?? "");
  const [team, setTeam] = useState(initial.record?.team ?? "");
  const [customSlots, setCustomSlots] = useState<CustomSlot[]>(
    initial.record?.custom_slots ?? [],
  );
  // 단말기 없음으로 표시한 슬롯키(하차 등) — 사진 없이도 충족 처리
  const [naSlots, setNaSlots] = useState<string[]>(initial.record?.na_slots ?? []);
  const [editInfo, setEditInfo] = useState(false); // 운수사/노선 수정 모드

  // slotKey -> 미리보기 URL
  const [urls, setUrls] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const p of initial.photos) {
      m[p.slot_key] = `${publicPhotoUrl(p.storage_path)}?t=${p.updated_at ?? ""}`;
    }
    return m;
  });

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  // 완료/실패 확인용 토스트 팝업 (2초 후 자동 사라짐)
  const [toast, setToast] = useState<
    { id: number; msg: string; type: "success" | "error" } | null
  >(null);
  const toastSeq = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback(
    (msg: string, type: "success" | "error" = "success") => {
      const id = ++toastSeq.current;
      setToast({ id, msg, type });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => {
        setToast((t) => (t && t.id === id ? null : t));
      }, 2000);
    },
    [],
  );
  const seqRef = useRef<number>(
    customSlots.reduce((max, c) => {
      const m = /before_custom_(\d+)/.exec(c.slot_key);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0),
  );

  const router = useRouter();
  const beforeSlots = useMemo(() => buildBeforeSlots(customSlots), [customSlots]);

  const saveRecord = useCallback(
    async (
      overrides?: Partial<{
        operator: string;
        route: string;
        year: string;
        model: string;
        team: string;
        custom_slots: CustomSlot[];
        na_slots: string[];
        saved: boolean;
      }>,
    ) => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plate,
            operator: overrides?.operator ?? operator,
            route: overrides?.route ?? route,
            year: overrides?.year ?? year,
            model: overrides?.model ?? model,
            team: overrides?.team ?? team,
            custom_slots: overrides?.custom_slots ?? customSlots,
            na_slots: overrides?.na_slots ?? naSlots,
            saved: overrides?.saved ?? false,
          }),
        });
        if (!res.ok) throw new Error();
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
        // 최종 '저장'(saved=true)은 별도 안내가 있으므로 토스트 생략
        if (!overrides?.saved) showToast("저장되었습니다");
        return true;
      } catch {
        setSaveState("error");
        showToast("저장에 실패했습니다", "error");
        return false;
      }
    },
    [plate, operator, route, year, model, team, customSlots, naSlots, showToast],
  );

  // '단말기 없음' 토글 → 상태 갱신 후 저장(서버가 시작/완료 판정·팀즈 알림)
  function toggleNoTerminal(slotKey: string, value: boolean) {
    const next = value
      ? Array.from(new Set([...naSlots, slotKey]))
      : naSlots.filter((k) => k !== slotKey);
    setNaSlots(next);
    saveRecord({ na_slots: next });
  }

  function toggleEditInfo() {
    if (editInfo) {
      // 완료 → 저장
      saveRecord();
    }
    setEditInfo((v) => !v);
  }

  const [submitting, setSubmitting] = useState(false);
  const [savedPopup, setSavedPopup] = useState(false); // 저장 완료 팝업
  async function handleSave() {
    if (!team.trim()) {
      showToast("팀명을 입력해야 저장할 수 있습니다", "error");
      return;
    }
    setSubmitting(true);
    const ok = await saveRecord({ saved: true });
    setSubmitting(false);
    if (ok) {
      setSavedPopup(true);
    } else {
      showToast("저장에 실패했습니다. 다시 시도해주세요", "error");
    }
  }

  function addCustomSlot() {
    const label = prompt("추가할 항목(칸) 이름을 입력하세요");
    if (!label || !label.trim()) return;
    seqRef.current += 1;
    const next: CustomSlot = {
      slot_key: makeCustomSlotKey(seqRef.current),
      label: label.trim(),
      sort_order: customSlots.length,
    };
    const updated = [...customSlots, next];
    setCustomSlots(updated);
    saveRecord({ custom_slots: updated });
  }

  async function removeCustomSlot(slotKey: string) {
    if (!confirm("이 항목(칸)을 삭제할까요? 사진도 함께 삭제됩니다.")) return;
    // 사진 먼저 삭제
    await fetch(
      `/api/photos?plate=${encodeURIComponent(plate)}&slot_key=${encodeURIComponent(slotKey)}`,
      { method: "DELETE" },
    ).catch(() => {});
    const updated = customSlots.filter((c) => c.slot_key !== slotKey);
    setCustomSlots(updated);
    setUrls((u) => {
      const n = { ...u };
      delete n[slotKey];
      return n;
    });
    saveRecord({ custom_slots: updated });
  }

  const handleUploaded = useCallback(
    (slotKey: string, url: string) => {
      setUrls((u) => ({ ...u, [slotKey]: url }));
      showToast("사진이 저장되었습니다");
    },
    [showToast],
  );
  const handleDeleted = useCallback(
    (slotKey: string) => {
      setUrls((u) => {
        const n = { ...u };
        delete n[slotKey];
        return n;
      });
      showToast("사진이 삭제되었습니다");
    },
    [showToast],
  );
  const handleSlotError = useCallback(
    (msg: string) => showToast(msg, "error"),
    [showToast],
  );

  return (
    <main className="mx-auto max-w-3xl px-3 pb-24 pt-4">
      {/* 완료/실패 토스트 팝업 */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 no-print">
          <div
            className={`rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg ${
              toast.type === "success" ? "bg-green-600" : "bg-red-600"
            }`}
          >
            {toast.type === "success" ? "✓ " : "⚠ "}
            {toast.msg}
          </div>
        </div>
      )}

      {/* 저장 완료 팝업 */}
      {savedPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 no-print">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl">
            <div className="text-4xl">✅</div>
            <p className="mt-2 text-lg font-bold text-gray-800">저장되었습니다</p>
            <p className="mt-1 text-xs text-gray-500">
              {plate} · 목록에서 확인·다운로드할 수 있습니다.
            </p>
            <button
              onClick={() => router.push("/list")}
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white active:bg-blue-700"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 상단 바 */}
      <div className="mb-3 flex items-center justify-between">
        <Link href="/" className="text-sm text-blue-600">
          ← 차량 변경
        </Link>
        <span className="text-xs text-gray-400">
          {saveState === "saving" && "저장 중…"}
          {saveState === "saved" && "저장됨 ✓"}
          {saveState === "error" && <span className="text-red-500">저장 실패</span>}
        </span>
      </div>

      {/* 헤더 정보 */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        {/* 타이틀 위 수정 버튼 */}
        <div className="mb-1 flex justify-end">
          <button
            onClick={toggleEditInfo}
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              editInfo
                ? "bg-blue-600 text-white active:bg-blue-700"
                : "border border-gray-300 text-gray-600 active:bg-gray-100"
            }`}
          >
            {editInfo ? "완료" : "수정"}
          </button>
        </div>
        <h1 className="mb-3 text-center text-lg font-bold text-blue-700">
          B820 설치 사진
        </h1>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <Field label="설치일자" value={installDate} />
          <Field label="차량NO" value={plate} />
          {editInfo ? (
            <EditField
              label="운수사"
              value={operator}
              placeholder="운수사"
              onChange={setOperator}
              onBlur={() => saveRecord()}
            />
          ) : (
            <Field label="운수사" value={operator} />
          )}
          {editInfo ? (
            <EditField
              label="노선"
              value={route}
              placeholder="노선"
              onChange={setRoute}
              onBlur={() => saveRecord()}
            />
          ) : (
            <Field label="노선" value={route} />
          )}
          <EditField
            label="연식"
            value={year}
            placeholder="예: 2021"
            onChange={setYear}
            onBlur={() => saveRecord()}
          />
          <EditField
            label="차종"
            value={model}
            placeholder="예: 일렉시티"
            onChange={setModel}
            onBlur={() => saveRecord()}
          />
          <label className="col-span-2 flex flex-col">
            <span className="text-xs text-gray-400">
              팀명 <span className="text-red-500">*</span>
            </span>
            <input
              value={team}
              placeholder="설치 팀명 (필수)"
              onChange={(e) => setTeam(e.target.value)}
              onBlur={() => saveRecord()}
              className={`rounded border px-2 py-1 outline-none focus:border-blue-500 ${
                team.trim() ? "border-gray-300" : "border-red-300 bg-red-50"
              }`}
            />
            {!team.trim() && (
              <span className="mt-0.5 text-[11px] text-red-500">
                팀명을 입력해야 저장할 수 있습니다.
              </span>
            )}
          </label>
        </div>
      </section>

      {/* 설치 전 */}
      <SectionHeader title="설치 전" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {beforeSlots.map((slot, i) => (
          <PhotoSlot
            key={slot.slotKey}
            plate={plate}
            slot={slot}
            sortOrder={i}
            initialUrl={urls[slot.slotKey] ?? null}
            onUploaded={handleUploaded}
            onDeleted={handleDeleted}
            onError={handleSlotError}
            onRemoveSlot={removeCustomSlot}
            allowNoTerminal={slot.slotKey.includes("alight")}
            noTerminal={naSlots.includes(slot.slotKey)}
            onToggleNoTerminal={toggleNoTerminal}
          />
        ))}
        <button
          onClick={addCustomSlot}
          className="flex aspect-[3/2] min-h-[120px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-blue-300 text-blue-500 active:bg-blue-50"
        >
          <span className="text-2xl">+</span>
          <span className="text-xs">항목 추가</span>
        </button>
      </div>

      {/* 설치 후 */}
      <SectionHeader title="설치 후" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {AFTER_SLOTS.map((slot, i) => (
          <PhotoSlot
            key={slot.slotKey}
            plate={plate}
            slot={slot}
            sortOrder={i}
            initialUrl={urls[slot.slotKey] ?? null}
            onUploaded={handleUploaded}
            onDeleted={handleDeleted}
            onError={handleSlotError}
            allowNoTerminal={slot.slotKey.includes("alight")}
            noTerminal={naSlots.includes(slot.slotKey)}
            onToggleNoTerminal={toggleNoTerminal}
          />
        ))}
      </div>

      {/* 저장 */}
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-3 backdrop-blur no-print">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Link
            href="/list"
            className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 active:bg-gray-100"
          >
            목록
          </Link>
          <button
            onClick={handleSave}
            disabled={submitting}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function EditField({
  label,
  value,
  placeholder,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <label className="flex flex-col">
      <span className="text-xs text-gray-400">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="rounded border border-gray-300 px-2 py-1 outline-none focus:border-blue-500"
      />
    </label>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-2 mt-5 rounded-md bg-gray-700 px-3 py-1.5 text-sm font-semibold text-white">
      {title}
    </h2>
  );
}
