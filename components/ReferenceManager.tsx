"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BEFORE_SLOTS, AFTER_SLOTS, type SlotDef } from "@/lib/slots";
import { compressImage } from "@/lib/image-compress";

interface Props {
  initialUrls: Record<string, string>;
}

// 기준(양식) 사진 관리 — 슬롯별 올바른 예시 사진 1장 업로드/교체/삭제.
export default function ReferenceManager({ initialUrls }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>(initialUrls);

  return (
    <main className="mx-auto max-w-3xl px-3 pb-16 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/admin" className="text-sm text-blue-600">
          ← 관리자
        </Link>
        <h1 className="text-lg font-bold text-blue-700">기준(양식) 사진</h1>
        <span className="w-12" />
      </div>

      <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
        칸마다 <b>올바른 예시 사진</b>을 올려두면, 사용자가 사진을 올릴 때 Gemini가 이 기준과
        비교해 <b>다른 대상·잘못된 칸</b>이면 저장을 막습니다. (기준사진이 없는 칸은 비교하지 않음)
      </p>

      <SectionHeader title="설치 전" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {BEFORE_SLOTS.map((slot) => (
          <ReferenceSlot key={slot.slotKey} slot={slot} url={urls[slot.slotKey]} setUrls={setUrls} />
        ))}
      </div>

      <SectionHeader title="설치 후" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {AFTER_SLOTS.map((slot) => (
          <ReferenceSlot key={slot.slotKey} slot={slot} url={urls[slot.slotKey]} setUrls={setUrls} />
        ))}
      </div>
    </main>
  );
}

function ReferenceSlot({
  slot,
  url,
  setUrls,
}: {
  slot: SlotDef;
  url?: string;
  setUrls: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const form = new FormData();
      form.append("file", compressed);
      form.append("slot_key", slot.slotKey);
      form.append("section", slot.section);
      form.append("label", slot.label);
      const res = await fetch("/api/admin/reference", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "업로드 실패");
      setUrls((u) => ({ ...u, [slot.slotKey]: json.url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm("기준사진을 삭제할까요?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/reference?slot_key=${encodeURIComponent(slot.slotKey)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("삭제 실패");
      setUrls((u) => {
        const n = { ...u };
        delete n[slot.slotKey];
        return n;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
      <p className="mb-1.5 truncate text-sm font-medium text-gray-700">{slot.label}</p>
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded bg-gray-100">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={slot.label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
            기준사진 없음
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm">
            처리 중…
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      <div className="mt-2 flex gap-1.5">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex-1 rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white active:bg-blue-700 disabled:opacity-50"
        >
          {url ? "교체" : "업로드"}
        </button>
        {url && (
          <button
            onClick={handleDelete}
            disabled={busy}
            className="rounded border border-red-300 px-2 py-1.5 text-xs text-red-500 active:bg-red-50 disabled:opacity-50"
          >
            삭제
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-2 mt-5 rounded-md bg-gray-700 px-3 py-1.5 text-sm font-semibold text-white">
      {title}
    </h2>
  );
}
