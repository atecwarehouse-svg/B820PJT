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

  // 증차 차량 추가
  const [addOpen, setAddOpen] = useState(false);
  const [newPlate, setNewPlate] = useState("");
  const [newOp, setNewOp] = useState("");
  const [newRoute, setNewRoute] = useState("");
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  function openAdd() {
    setNewPlate(q.trim());
    setNewOp("");
    setNewRoute("");
    setAddErr(null);
    setAddOpen(true);
  }

  async function submitAdd() {
    const plate = newPlate.trim();
    if (!plate || !newOp.trim() || !newRoute.trim()) {
      setAddErr("차량번호·운수사·노선을 모두 입력하세요.");
      return;
    }
    setAdding(true);
    setAddErr(null);
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate, operator: newOp.trim(), route: newRoute.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "추가 실패");
      router.push(`/record/${encodeURIComponent(plate)}`);
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : "추가 실패");
      setAdding(false);
    }
  }

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

      {!loading && q.trim().length >= 1 && results.length === 0 && !error && !addOpen && (
        <p className="mt-3 text-sm text-gray-400">일치하는 차량이 없습니다.</p>
      )}

      {/* 증차 차량 추가 */}
      {q.trim().length >= 1 && !addOpen && (
        <button
          onClick={openAdd}
          className="mt-3 w-full rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 active:bg-blue-100"
        >
          + 안 나오는 차량 추가 (증차)
        </button>
      )}

      {addOpen && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-white p-3 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-blue-700">증차 차량 추가</p>
          <div className="space-y-2">
            <input
              value={newPlate}
              onChange={(e) => setNewPlate(e.target.value)}
              placeholder="차량번호 (예: 인천70바9999)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              value={newOp}
              onChange={(e) => setNewOp(e.target.value)}
              placeholder="운수사"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              value={newRoute}
              onChange={(e) => setNewRoute(e.target.value)}
              placeholder="노선"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          {addErr && <p className="mt-2 text-xs text-red-500">{addErr}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setAddOpen(false)}
              disabled={adding}
              className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 active:bg-gray-200 disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={submitAdd}
              disabled={adding}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
            >
              {adding ? "추가 중…" : "추가하고 시작"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
