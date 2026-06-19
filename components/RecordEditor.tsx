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
  const [year, setYear] = useState(initial.record?.year ?? "");
  const [model, setModel] = useState(initial.record?.model ?? "");
  const [customSlots, setCustomSlots] = useState<CustomSlot[]>(
    initial.record?.custom_slots ?? [],
  );
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
        custom_slots: CustomSlot[];
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
            custom_slots: overrides?.custom_slots ?? customSlots,
            saved: overrides?.saved ?? false,
          }),
        });
        if (!res.ok) throw new Error();
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
        return true;
      } catch {
        setSaveState("error");
        return false;
      }
    },
    [plate, operator, route, year, model, customSlots],
  );

  function toggleEditInfo() {
    if (editInfo) {
      // 완료 → 저장
      saveRecord();
    }
    setEditInfo((v) => !v);
  }

  const [submitting, setSubmitting] = useState(false);
  async function handleSave() {
    setSubmitting(true);
    const ok = await saveRecord({ saved: true });
    setSubmitting(false);
    if (ok) {
      alert("저장되었습니다. 목록에서 다운로드할 수 있습니다.");
      router.push("/list");
    } else {
      alert("저장에 실패했습니다. 다시 시도해주세요.");
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

  const handleUploaded = useCallback((slotKey: string, url: string) => {
    setUrls((u) => ({ ...u, [slotKey]: url }));
  }, []);
  const handleDeleted = useCallback((slotKey: string) => {
    setUrls((u) => {
      const n = { ...u };
      delete n[slotKey];
      return n;
    });
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-3 pb-24 pt-4">
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
            onRemoveSlot={removeCustomSlot}
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
