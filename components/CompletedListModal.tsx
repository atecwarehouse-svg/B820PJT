"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CompletedVehicle } from "@/lib/stats";

// 완료 KPI 카드 클릭 → 운수사 선택 → 해당 운수사 설치완료 차량 목록 팝업.
// children = 카드 내용, cardClassName = 카드(버튼) 스타일.
export default function CompletedListModal({
  list,
  title,
  cardClassName,
  children,
}: {
  list: CompletedVehicle[];
  title: string;
  cardClassName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [operator, setOperator] = useState("");

  const operators = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of list) m.set(v.operator, (m.get(v.operator) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko"));
  }, [list]);

  const filtered = operator === "전체" ? list : list.filter((v) => v.operator === operator);

  return (
    <>
      <button
        type="button"
        onClick={() => list.length > 0 && setOpen(true)}
        disabled={list.length === 0}
        className={`${cardClassName} transition-colors disabled:opacity-60`}
      >
        {children}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-8 w-full max-w-lg rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-bold text-green-700">
                {title} <span className="text-gray-400">({list.length}대)</span>
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="border-b border-gray-100 px-4 py-3">
              <select
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-500"
              >
                <option value="">운수사를 선택하세요</option>
                <option value="전체">전체 ({list.length}대)</option>
                {operators.map(([op, n]) => (
                  <option key={op} value={op}>
                    {op} ({n}대)
                  </option>
                ))}
              </select>
            </div>

            {operator === "" ? (
              <p className="py-10 text-center text-sm text-gray-400">
                운수사를 선택하면 설치완료 차량이 표시됩니다.
              </p>
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">설치완료 차량이 없습니다.</p>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto">
                {filtered.map((v) => (
                  <li key={v.plate}>
                    <Link
                      href={`/record/${encodeURIComponent(v.plate)}`}
                      className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm active:bg-green-50"
                    >
                      <span className="min-w-0 truncate">
                        <span className="text-gray-500">
                          {v.operator}
                          {v.route ? ` ${v.route}` : ""}
                        </span>{" "}
                        <span className="font-medium">{v.plate}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-xs text-gray-400">
                        {v.workDate.replace(/-/g, ".")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
