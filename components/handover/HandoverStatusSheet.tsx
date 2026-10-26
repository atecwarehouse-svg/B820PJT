"use client";

import { useEffect, useState } from "react";
import { downloadUrl } from "@/lib/download";
import { FOLD_OVER, fmtDone, shortRoute, typeEmoji } from "./HandoverChecklist";

interface Vehicle {
  plate: string;
  operator: string;
  route: string;
  done_at: string | null;
  done_by: string | null;
  note: string | null;
  bus_type?: string | null; // OS업데이트: 시내/마을버스
  center?: string | null; // OS업데이트: 차량별 센터
}
interface Stat {
  t: number;
  d: number;
}

const pct = (d: number, t: number) => (t ? Math.round((d / t) * 100) : 0);

// 📊 현황표 시트 — 전체 센터 진행률(센터별·구분별·노선별/운수사별) + 완료 차량 리스트 엑셀 다운로드. 읽기 전용(/api/handover?all=1).
//   byOperator(OS업데이트) = 묶음을 노선 대신 운수사로. 묶음이 FOLD_OVER 개를 넘으면 접어 둔다.
export default function HandoverStatusSheet({ byOperator = false, onClose }: { byOperator?: boolean; onClose: () => void }) {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [centers, setCenters] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/handover?all=1", { cache: "no-store" })
      .then(async (res) => {
        const j = (await res.json()) as { vehicles?: Vehicle[]; centers?: Record<string, string>; error?: string };
        if (!res.ok) throw new Error(j.error ?? "불러오기 실패");
        setVehicles(j.vehicles ?? []);
        setCenters(j.centers ?? {});
      })
      .catch((e) => setError(e instanceof Error ? e.message : "불러오기 실패"));
  }, []);

  const list = vehicles ?? [];
  const total = list.length;
  const done = list.filter((v) => v.done_at).length;
  const centerOf = (v: Vehicle) => v.center ?? centers[v.operator] ?? "미배정";
  const byCenter = new Map<string, Stat>();
  const byType = new Map<string, Stat>(); // OS업데이트: 시내/마을버스
  const byRoute = new Map<string, Stat & { center: string; type: string | null }>();
  for (const v of list) {
    const c = byCenter.get(centerOf(v)) ?? { t: 0, d: 0 };
    c.t++;
    if (v.done_at) c.d++;
    byCenter.set(centerOf(v), c);
    if (v.bus_type) {
      const x = byType.get(v.bus_type) ?? { t: 0, d: 0 };
      x.t++;
      if (v.done_at) x.d++;
      byType.set(v.bus_type, x);
    }
    for (const key of byOperator ? [v.operator] : v.route.split(" / ")) {
      // 공동배차 차량은 각 노선에 모두 집계(노선 대수 = 로우데이터 행 수)
      const r = byRoute.get(key) ?? { t: 0, d: 0, center: centerOf(v), type: v.bus_type ?? null };
      r.t++;
      if (v.done_at) r.d++;
      byRoute.set(key, r);
    }
  }
  const groupLabel = (key: string) => (byOperator ? key : shortRoute(key));
  const recent = list.filter((v) => v.done_at).sort((a, b) => b.done_at!.localeCompare(a.done_at!)).slice(0, 5);

  const bar = (d: number, t: number) => (
    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
      <span className={`block h-full rounded-full ${pct(d, t) === 100 && t ? "bg-green-500" : "bg-blue-400"}`} style={{ width: `${pct(d, t)}%` }} />
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl bg-white sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4">
          <p className="text-base font-bold text-gray-900">📊 전체 센터 현황표</p>
          <button type="button" onClick={onClose} className="pill-muted text-xs" aria-label="닫기">
            닫기
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          {!vehicles && !error && <p className="py-8 text-center text-sm text-gray-400">불러오는 중…</p>}
          {vehicles && (
            <>
              <div className="flex items-end justify-between">
                <p className="text-4xl font-bold tabular-nums tracking-tight text-gray-900">
                  {pct(done, total)}
                  <span className="text-xl text-gray-400">%</span>
                </p>
                <p className="text-sm text-gray-500">
                  <b className="text-xl text-green-600">{done}</b> / {total}대 · 남은 {total - done}대
                </p>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${pct(done, total) === 100 && total ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${pct(done, total)}%` }} />
              </div>

              <h3 className="mt-4 text-xs font-semibold text-gray-500">센터별</h3>
              <ul className="mt-1.5 space-y-2">
                {[...byCenter.entries()].map(([c, n]) => (
                  <li key={c} className="flex items-center gap-2 text-sm">
                    <span className="w-20 shrink-0 truncate font-bold text-gray-800">{c}</span>
                    {bar(n.d, n.t)}
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-gray-500">
                      {n.d}/{n.t} · {pct(n.d, n.t)}%
                    </span>
                  </li>
                ))}
              </ul>

              {byType.size > 0 && (
                <>
                  <h3 className="mt-4 text-xs font-semibold text-gray-500">구분별</h3>
                  <ul className="mt-1.5 space-y-2">
                    {[...byType.entries()].sort(([a], [b]) => a.localeCompare(b, "ko")).map(([t, n]) => (
                      <li key={t} className="flex items-center gap-2 text-sm">
                        <span className="w-24 shrink-0 truncate font-bold text-gray-800">
                          {typeEmoji(t)} {t}
                        </span>
                        {bar(n.d, n.t)}
                        <span className="w-24 shrink-0 text-right text-xs tabular-nums text-gray-500">
                          {n.d}/{n.t} · {pct(n.d, n.t)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <details className="mt-4" open={byRoute.size <= FOLD_OVER}>
                <summary className="cursor-pointer select-none text-xs font-semibold text-gray-500">
                  {byOperator ? "운수사별" : "노선별"} ({byRoute.size}개)
                </summary>
                <ul className="mt-1.5 space-y-1.5">
                  {[...byRoute.entries()].sort(([a], [b]) => a.localeCompare(b, "ko")).map(([r, n]) => (
                    <li key={r} className="flex items-center gap-2 text-xs">
                      <span className="w-32 shrink-0 truncate font-semibold text-gray-700">
                        {!byOperator && n.type ? `${typeEmoji(n.type)} ` : ""}
                        {groupLabel(r)} <span className="font-normal text-gray-400">· {n.center}</span>
                      </span>
                      {bar(n.d, n.t)}
                      <span className="w-14 shrink-0 text-right tabular-nums text-gray-500">
                        {n.d}/{n.t}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>

              {recent.length > 0 && (
                <>
                  <h3 className="mt-4 text-xs font-semibold text-gray-500">최근 완료</h3>
                  <ul className="mt-1.5 space-y-1 text-xs text-gray-600">
                    {recent.map((v) => (
                      <li key={v.plate} className="flex justify-between gap-2">
                        <span className="truncate">
                          <b className="text-gray-800">{v.plate}</b> · {centerOf(v)} · {v.done_by}
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-400">{fmtDone(v.done_at!)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 border-t border-gray-100 p-4">
          <button
            type="button"
            onClick={() => downloadUrl("/api/handover/export?done=1")}
            disabled={!done}
            className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white active:bg-emerald-700 disabled:opacity-40"
          >
            📥 완료 차량 리스트 ({done}대)
          </button>
          <button type="button" onClick={() => downloadUrl("/api/handover/export")} className="rounded-xl bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700 active:bg-gray-200">
            전체 현황
          </button>
        </div>
      </div>
    </div>
  );
}
