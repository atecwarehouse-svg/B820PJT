"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface ListItem {
  plate: string;
  operator: string;
  route: string;
  installDate: string;
  year: string;
  model: string;
  photoCount: number;
}

export default function ListClient({ items }: { items: ListItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | "pdf" | "xlsx">(null);

  const allChecked = selected.size === items.length && items.length > 0;
  const selectedPlates = useMemo(() => [...selected], [selected]);

  function toggle(plate: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(plate)) n.delete(plate);
      else n.add(plate);
      return n;
    });
  }
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(items.map((i) => i.plate)));
  }

  async function download(kind: "pdf" | "xlsx") {
    if (selectedPlates.length === 0) {
      alert("다운로드할 차량을 선택하세요.");
      return;
    }
    setBusy(kind);
    try {
      const res = await fetch(`/api/export/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plates: selectedPlates }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "다운로드 실패");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        kind === "pdf"
          ? `B820_설치사진첩_${selectedPlates.length}대.pdf`
          : `B820_설치사진첩_${selectedPlates.length}대.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "다운로드 실패");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <label className="mb-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4" />
        전체 선택 ({selected.size}/{items.length})
      </label>

      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {items.map((it) => (
          <li key={it.plate} className="flex items-center gap-3 px-3 py-2.5">
            <input
              type="checkbox"
              checked={selected.has(it.plate)}
              onChange={() => toggle(it.plate)}
              className="h-4 w-4 shrink-0"
            />
            <Link href={`/record/${encodeURIComponent(it.plate)}`} className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{it.plate}</span>
                <span className="text-xs text-gray-400">{it.photoCount}장</span>
              </div>
              <div className="truncate text-xs text-gray-500">
                {it.operator} · {it.route} · {it.installDate}
                {it.year || it.model ? ` · ${it.year} ${it.model}` : ""}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* 하단 고정 다운로드 바 */}
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-2">
          <button
            onClick={() => download("pdf")}
            disabled={busy !== null}
            className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-semibold text-white active:bg-rose-700 disabled:opacity-50"
          >
            {busy === "pdf" ? "PDF 생성 중…" : `PDF 다운로드${selected.size ? ` (${selected.size})` : ""}`}
          </button>
          <button
            onClick={() => download("xlsx")}
            disabled={busy !== null}
            className="rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white active:bg-green-700 disabled:opacity-50"
          >
            {busy === "xlsx" ? "엑셀 생성 중…" : `엑셀 다운로드${selected.size ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
