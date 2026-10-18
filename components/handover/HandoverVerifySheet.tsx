"use client";

import { useEffect, useRef, useState } from "react";
import { downloadUrl } from "@/lib/download";
import { shortRoute } from "./HandoverChecklist";

interface Item {
  plate: string;
  operator: string;
  route: string;
  center: string;
  status: "ok" | "partial" | "missing";
  reason: string;
  done_by: string | null;
}
interface Result {
  fileName: string;
  fileAt: string;
  fileBy: string;
  fileVehicles: number;
  overall: { total: number; ok: number };
  centers: { label: string; total: number; ok: number }[];
  items: Item[];
  extra: string[];
}

const pct = (ok: number, t: number) => (t ? Math.round((ok / t) * 100) : 0);

// 🔎 서버 등록 검증 — 차량단말기버전 조회 파일(.xls)을 올리면 차량별 단말기 5종(55000·56000·1560×3) 등록 여부를 대조해 팝업으로 보여 준다.
// 최근 파일은 서버(app_settings)에 저장돼 다시 열면 재업로드 없이 현재 DB 와 다시 대조한다(새 업로드가 교체). 업로드 때만 팀즈 관리자 호출방 카드.
export default function HandoverVerifySheet({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);
  const [loading, setLoading] = useState(true); // 저장된 최근 파일 불러오는 중

  // 열 때 서버에 저장된 최근 파일로 다시 대조(재업로드 불필요). 새로 올리면 교체.
  useEffect(() => {
    fetch("/api/handover/verify", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as (Result & { saved: boolean }) | { error?: string };
        if (!r.ok) throw new Error(("error" in j && j.error) || "불러오기 실패");
        if ("saved" in j && j.saved) setRes(j);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/handover/verify", { method: "POST", body: form });
      const j = (await r.json().catch(() => ({}))) as Result & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "검증 실패");
      setRes(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "검증 실패");
    } finally {
      setBusy(false);
    }
  }

  const pending = res?.items.filter((i) => i.status !== "ok") ?? [];
  const shown = res ? (onlyPending ? pending : res.items) : [];
  const doneNotVerified = pending.filter((i) => i.done_by);
  // 센터 → 노선별 묶음(팀즈 카드와 같은 규칙). 공동배차(route "A / B")는 각 노선에 모두.
  const groups = (() => {
    const m = new Map<string, Map<string, Item[]>>();
    for (const i of shown) {
      const routes = m.get(i.center) ?? new Map<string, Item[]>();
      for (const r of i.route.split(" / ")) {
        const k = shortRoute(r);
        routes.set(k, [...(routes.get(k) ?? []), i]);
      }
      m.set(i.center, routes);
    }
    return [...m.entries()].map(([c, routes]) => [c, [...routes.entries()].sort(([a], [b]) => a.localeCompare(b, "ko"))] as const);
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl bg-white sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4">
          <p className="text-base font-bold text-gray-900">🔎 서버 등록 검증</p>
          <button type="button" onClick={onClose} className="pill-muted text-xs" aria-label="닫기">
            닫기
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {!res && !loading && (
            <p className="text-xs leading-relaxed text-gray-500">
              서버에서 내려받은 <b>차량단말기버전 조회 파일(.xls)</b>을 올리면 차량마다 단말기 5개(55000… 1개 · 56000… 1개 · 1560… 3개)가 등록됐는지 대조합니다.
              파일에 없거나 5개가 안 되는 차량은 <b className="text-red-600">미완료</b>로 표시되고, 결과는 팀즈 관리자 호출방에도 카드로 갑니다.
            </p>
          )}
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => fileRef.current?.click()}
            className="mt-3 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "검증 중…" : loading ? "최근 파일 불러오는 중…" : res ? "📂 새 파일 올려 교체" : "📂 차량단말기버전 파일 선택"}
          </button>
          {error && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

          {res && (
            <>
              <p className="mt-3 truncate text-[11px] text-gray-400">
                📎 {res.fileName} · 파일 차량 {res.fileVehicles}대
              </p>
              <p className="truncate text-[11px] text-gray-400">
                {new Date(res.fileAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} {res.fileBy} 업로드 · 현재 체크 상태로 다시 대조함
              </p>
              <div className="mt-1 flex items-end justify-between">
                <p className="text-4xl font-bold tabular-nums tracking-tight text-gray-900">
                  {pct(res.overall.ok, res.overall.total)}
                  <span className="text-xl text-gray-400">%</span>
                </p>
                <p className="text-sm text-gray-500">
                  등록 확인 <b className="text-xl text-green-600">{res.overall.ok}</b> / {res.overall.total}대 · 미완료 <b className="text-red-600">{pending.length}</b>대
                </p>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${pending.length ? "bg-blue-500" : "bg-green-500"}`} style={{ width: `${pct(res.overall.ok, res.overall.total)}%` }} />
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {res.centers.map((c) => (
                  <li key={c.label} className="flex justify-between">
                    <span className="font-semibold text-gray-700">{c.label}</span>
                    <span className="tabular-nums text-gray-500">
                      {c.ok}/{c.total} · 미완료 {c.total - c.ok} · {pct(c.ok, c.total)}%
                    </span>
                  </li>
                ))}
              </ul>
              {doneNotVerified.length > 0 && (
                <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠️ 체크리스트는 완료인데 서버 미등록 {doneNotVerified.length}대: {doneNotVerified.map((i) => i.plate).join(", ")}
                </p>
              )}
              {res.extra.length > 0 && (
                <p className="mt-2 text-[11px] text-gray-400">파일에만 있는 차량(목록에 없음) {res.extra.length}대: {res.extra.join(", ")}</p>
              )}
              <button
                type="button"
                onClick={() => downloadUrl("/api/handover/verify?format=xlsx")}
                className="mt-2 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white active:bg-emerald-700"
              >
                📥 검증 결과 엑셀 다운로드
              </button>

              <div className="mt-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-500">차량 {shown.length}대</h3>
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} className="h-4 w-4" />
                  미완료만
                </label>
              </div>
              {shown.length === 0 ? (
                <p className="py-6 text-center text-sm text-green-600">✅ 미완료 차량이 없습니다.</p>
              ) : (
                groups.map(([center, routes]) => (
                  <section key={center} className="mt-2">
                    <h4 className="px-1 text-sm font-bold text-gray-800">📍 {center}</h4>
                    {routes.map(([route, list]) => (
                      <div key={route} className="mt-1.5">
                        <p className="mb-1 flex items-baseline justify-between px-1 text-xs font-semibold text-gray-600">
                          <span>🚌 {route}</span>
                          <span className="tabular-nums text-gray-400">{list.length}대</span>
                        </p>
                        <ul className="divide-y divide-gray-100 rounded-2xl bg-white ring-1 ring-black/5">
                          {list.map((i) => (
                            <li key={i.plate} className={`flex items-center justify-between gap-2 px-3 py-2 ${i.status === "ok" ? "" : "bg-red-50/60"}`}>
                              <div className="min-w-0">
                                <p className={`text-sm font-bold ${i.status === "ok" ? "text-gray-800" : "text-red-700"}`}>{i.plate}</p>
                                {i.done_by && <p className="truncate text-[11px] text-green-700">✔ {i.done_by}</p>}
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${i.status === "ok" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                {i.status === "ok" ? "등록 확인" : i.status === "missing" ? "미완료 · 파일에 없음" : `미완료 · ${i.reason}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </section>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
