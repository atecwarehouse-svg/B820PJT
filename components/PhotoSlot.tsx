"use client";

import { useRef, useState } from "react";
import type { SlotDef } from "@/lib/slots";
import { compressImage } from "@/lib/image-compress";

interface Props {
  plate: string;
  slot: SlotDef;
  sortOrder: number;
  initialUrl?: string | null;
  onUploaded: (slotKey: string, url: string) => void;
  onDeleted: (slotKey: string) => void;
  onError?: (msg: string) => void; // 실패 시 부모(토스트)로 알림
  onRemoveSlot?: (slotKey: string) => void; // 커스텀 슬롯 칸 자체 삭제
  allowNoTerminal?: boolean; // '단말기 없음' 체크 허용(하차 칸 등)
  noTerminal?: boolean; // 단말기 없음 상태
  onToggleNoTerminal?: (slotKey: string, value: boolean) => void;
}

export default function PhotoSlot({
  plate,
  slot,
  sortOrder,
  initialUrl,
  onUploaded,
  onDeleted,
  onError,
  onRemoveSlot,
  allowNoTerminal,
  noTerminal,
  onToggleNoTerminal,
}: Props) {
  const [url, setUrl] = useState<string | null>(initialUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const form = new FormData();
      form.append("file", compressed);
      form.append("plate", plate);
      form.append("section", slot.section);
      form.append("slot_key", slot.slotKey);
      form.append("label", slot.label);
      form.append("sort_order", String(sortOrder));
      form.append("is_custom", slot.isCustom ? "true" : "false");

      const res = await fetch("/api/photos", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "업로드 실패");
      setUrl(json.url);
      onUploaded(slot.slotKey, json.url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "업로드 실패";
      setError(msg);
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm("사진을 삭제할까요?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/photos?plate=${encodeURIComponent(plate)}&slot_key=${encodeURIComponent(slot.slotKey)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("삭제 실패");
      setUrl(null);
      onDeleted(slot.slotKey);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "삭제 실패";
      setError(msg);
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <span className="truncate text-sm font-medium text-gray-700">
          {slot.label}
        </span>
        {slot.isCustom && onRemoveSlot && (
          <button
            onClick={() => onRemoveSlot(slot.slotKey)}
            className="shrink-0 text-xs text-red-400"
            aria-label="항목 삭제"
          >
            칸삭제
          </button>
        )}
      </div>

      {/* 3:2 비율 사진 영역 */}
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded bg-gray-100">
        {noTerminal ? (
          <div className="flex h-full w-full items-center justify-center text-xs font-medium text-gray-500">
            단말기 없음
          </div>
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={slot.label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
            사진 없음
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm">
            처리 중…
          </div>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {/* 단말기 없음 체크 (하차 등) */}
      {allowNoTerminal && (
        <label className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={!!noTerminal}
            onChange={(e) => onToggleNoTerminal?.(slot.slotKey, e.target.checked)}
            className="h-3.5 w-3.5"
          />
          단말기 없음
        </label>
      )}

      {!noTerminal && (
        <>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
              className="rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white active:bg-blue-700 disabled:opacity-50"
            >
              촬영
            </button>
            <button
              onClick={() => galleryRef.current?.click()}
              disabled={busy}
              className="rounded bg-gray-100 px-2 py-1.5 text-xs font-medium text-gray-700 active:bg-gray-200 disabled:opacity-50"
            >
              앨범
            </button>
          </div>

          {url && (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="mt-1.5 w-full rounded px-2 py-1 text-xs text-red-500 active:bg-red-50 disabled:opacity-50"
            >
              사진 삭제
            </button>
          )}
        </>
      )}

      {/* 촬영(후면 카메라) */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      {/* 앨범 선택 */}
      <input
        ref={galleryRef}
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
