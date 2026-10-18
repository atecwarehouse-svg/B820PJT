"use client";

import { useRef, useState } from "react";
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
  fileVehicles: number;
  overall: { total: number; ok: number };
  centers: { label: string; total: number; ok: number }[];
  items: Item[];
  extra: string[];
}

const pct = (ok: number, t: number) => (t ? Math.round((ok / t) * 100) : 0);

// 🔎 서버 등록 검증 — 차량단말기버전 조회 파일(.xls)을 올리면 차량별 단말기 5종(55000·56000·1560×3) 등록 여부를 대조해 팝업으로 보여 준다.
// 결과는 저장하지 않고(파일이 곧 서버 상태) 팀즈 관리자 호출방에 진행현황 카드가 간다.
export default function HandoverVerifySheet({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null); // 엑셀 다운로드 = 같은 파일을 ?format=xlsx 로 폼 POST(attachment 응답 → iOS 포함 그대로 다운로드)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);

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
          <form ref={formRef} method="POST" action="/api/handover/verify?format=xlsx" encType="multipart/form-data" className="hidden">
            <input ref={fileRef} name="file" type="file" accept=".xls,.xlsx" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </form>
          {!res && (
            <p className="text-xs leading-relaxed text-gray-500">
              서버에서 내려받은 <b>차량단말기버전 조회 파일(.xls)</b>을 올리면 차량마다 단말기 5개(55000… 1개 · 56000… 1개 · 1560… 3개)가 등록됐는지 대조합니다.
              파일에 없거나 5개가 안 되는 차량은 <b className="text-red-600">미완료</b>로 표시되고, 결과는 팀즈 관리자 호출방에도 카드로 갑니다.
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="mt-3 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "검증 중…" : res ? "📂 다른 파일로 다시 검증" : "📂 차량단말기버전 파일 선택"}
          </button>
          {error && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

          {res && (
            <>
              <p className="mt-3 truncate text-[11px] text-gray-400">
                {res.fileName} · 파일 차량 {res.fileVehicles}대
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
              <p className="mt-2 text-[11px] text-gray-400">📨 팀즈 관리자 호출방에 검증 현황 카드를 보냈습니다.</p>
              <button
                type="button"
                onClick={() => formRef.current?.submit()}
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
                <ul className="mt-1.5 divide-y divide-gray-100 rounded-2xl bg-white ring-1 ring-black/5">
                  {shown.map((i) => (
                    <li key={i.plate} className={`flex items-center justify-between gap-2 px-3 py-2 ${i.status === "ok" ? "" : "bg-red-50/60"}`}>
                      <div className="min-w-0">
                        <p className={`text-sm font-bold ${i.status === "ok" ? "text-gray-800" : "text-red-700"}`}>{i.plate}</p>
                        <p className="truncate text-[11px] text-gray-500">
                          {i.center} · {shortRoute(i.route)}
                          {i.done_by && <span className="ml-1 text-green-700">✔ {i.done_by}</span>}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${i.status === "ok" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {i.status === "ok" ? "등록 확인" : i.status === "missing" ? "미완료 · 파일에 없음" : `미완료 · ${i.reason}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
