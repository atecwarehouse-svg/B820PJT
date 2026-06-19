"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Vehicle } from "@/lib/types";

export default function PlateSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = q.trim();
    if (query.length < 1) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/vehicles/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "검색 실패");
        setResults(json.results ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "검색 실패");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  function open(plate: string) {
    router.push(`/record/${encodeURIComponent(plate)}`);
  }

  return (
    <div>
      <input
        type="search"
        inputMode="text"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="차량번호 입력"
        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 shadow-sm outline-none focus:border-blue-500"
      />

      {loading && <p className="mt-3 text-sm text-gray-400">검색 중…</p>}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      {results.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {results.map((v) => (
            <li key={v.plate}>
              <button
                onClick={() => open(v.plate)}
                className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-blue-50"
              >
                <span className="font-medium">{v.plate}</span>
                <span className="text-sm text-gray-500">
                  {v.operator} · {v.route}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && q.trim().length >= 1 && results.length === 0 && !error && (
        <p className="mt-3 text-sm text-gray-400">일치하는 차량이 없습니다.</p>
      )}
    </div>
  );
}
