"use client";

import { useState } from "react";
import Link from "next/link";
import type { InProgressVehicle } from "@/lib/stats";

// 완료/진행중/미시작 KPI 카드 (사진 13장 기준).
// 진행중 카드를 누르면 사진 미완료 차량 목록 팝업.
export default function KpiCards({
  complete,
  inProgress,
  notStarted,
  target,
  inProgressList,
}: {
  complete: number;
  inProgress: number;
  notStarted: number;
  target: number;
  inProgressList: InProgressVehicle[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-green-100 bg-green-50 p-4 text-center">
          <p className="text-3xl font-bold tabular-nums text-green-700">{complete.toLocaleString()}</p>
          <p className="mt-1 text-xs font-medium text-green-700">완료</p>
        </div>

        <button
          type="button"
          onClick={() => inProgress > 0 && setOpen(true)}
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center transition-colors hover:bg-amber-100 disabled:opacity-60"
          disabled={inProgress === 0}
        >
          <p className="text-3xl font-bold tabular-nums text-amber-700">{inProgress.toLocaleString()}</p>
          <p className="mt-1 text-xs font-medium text-amber-700">
            진행중 {inProgress > 0 && <span className="text-amber-500">▸</span>}
          </p>
        </button>

        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-center">
          <p className="text-3xl font-bold tabular-nums text-gray-600">{notStarted.toLocaleString()}</p>
          <p className="mt-1 text-xs font-medium text-gray-600">미시작</p>
        </div>
      </div>
      <p className="mt-1 text-right text-[11px] text-gray-400">사진 {target}장 기준</p>

      {/* 진행중 차량 팝업 */}
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
              <h2 className="text-sm font-bold text-amber-700">
                진행중 차량 <span className="text-gray-400">(사진 미완료 · {inProgressList.length}대)</span>
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <ul className="max-h-[70vh] divide-y divide-gray-100 overflow-y-auto">
              {inProgressList.map((v) => {
                const pct = (v.photoCount / target) * 100;
                return (
                  <li key={v.plate}>
                    <Link
                      href={`/record/${encodeURIComponent(v.plate)}`}
                      className="block px-4 py-2.5 active:bg-amber-50"
                    >
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="text-gray-500">
                            {v.operator}
                            {v.route ? ` ${v.route}` : ""}
                          </span>{" "}
                          <span className="font-medium">{v.plate}</span>
                        </span>
                        <span className="shrink-0 tabular-nums font-semibold text-amber-600">
                          {v.photoCount}/{target}장
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
