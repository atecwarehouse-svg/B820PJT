"use client";

import { useEffect, useRef, useState } from "react";
import { downloadUrl } from "@/lib/download";
import { OS_FILE_LABEL, OS_FILE_TYPES, OS_RULE_TEXT, type OsFileType } from "@/lib/import/osverify-types";
import { shortRoute } from "./HandoverChecklist";

interface Stat {
  label: string;
  total: number;
  web: number;
  asset: number;
  os: number;
  all: number;
}
interface Item {
  plate: string;
  center: string;
  operator: string;
  route: string;
  model: string;
  web: boolean;
  asset: boolean;
  os: boolean;
  osInfo: string;
  all: boolean;
}
interface Result {
  files: { type: OsFileType; label: string; saved: boolean; fileName?: string; at?: string; by?: string; vehicles?: number; ok?: number }[];
  overall: Stat;
  centers: Stat[];
  items: Item[];
}

const pct = (a: number, t: number) => (t ? Math.round((a / t) * 100) : 0);
const fmtAt = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const LIST_MAX = 60;

// 🔎 OS업데이트 적용 검증 — 파일 4종(장애목록·B710·B700·B800 OS버전 .xls) 버튼으로 각각 올리면 서버에 저장되고,
// 차량마다 웹 체크·자산등록·기종별 OS버전을 대조한 결과(센터별 표 + 미완료 목록)를 보여 준다. 업로드 때마다 팀즈 카드(센터 방 + 관리자 호출방 취합).
export default function OsVerifySheet({ myCenter, onClose }: { myCenter: string; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<OsFileType>("fault");
  const [busy, setBusy] = useState<OsFileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [center, setCenter] = useState<string>(myCenter);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch("/api/handover/osverify", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as Result | { error?: string };
        if (!r.ok) throw new Error(("error" in j && j.error) || "불러오기 실패");
        setRes(j as Result);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  function pick(type: OsFileType) {
    typeRef.current = type;
    if (fileRef.current) {
      fileRef.current.value = "";
      fileRef.current.click();
    }
  }

  async function upload(file: File) {
    const type = typeRef.current;
    setBusy(type);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("type", type);
      const r = await fetch("/api/handover/osverify", { method: "POST", body: form });
      const j = (await r.json().catch(() => ({}))) as Result & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "검증 실패");
      setRes(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "검증 실패");
    } finally {
      setBusy(null);
    }
  }

  const centerNames = res?.centers.map((c) => c.label) ?? [];
  const cur = res?.centers.find((c) => c.label === center) ?? res?.overall;
  const pendingAll = res?.items.filter((i) => i.center === center && !i.all) ?? [];
  const pending = showAll ? pendingAll : pendingAll.slice(0, LIST_MAX);
  const mark = (b: boolean) => (b ? "✅" : "▢");
  const bar = (a: number, t: number) => (
    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
      <span className={`block h-full rounded-full ${pct(a, t) === 100 && t ? "bg-green-500" : "bg-blue-400"}`} style={{ width: `${pct(a, t)}%` }} />
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl bg-white sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4">
          <p className="text-base font-bold text-gray-900">🔎 OS업데이트 적용 검증</p>
          <button type="button" onClick={onClose} className="pill-muted text-xs" aria-label="닫기">
            닫기
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <p className="text-xs leading-relaxed text-gray-500">
            차량마다 <b>웹 체크 완료 · 자산등록(장애목록) · 기종별 OS버전</b> 셋을 차량번호로 대조합니다. 파일을 올리면 서버에 저장돼 다시 열 때 재업로드 없이 현재 상태로 다시
            대조하고, 올릴 때마다 팀즈 카드(센터 방 + 관리자 호출방 취합)가 갑니다.
          </p>

          {/* 업로드 4종 */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {OS_FILE_TYPES.map((t) => {
              const f = res?.files.find((x) => x.type === t);
              return (
                <button
                  key={t}
                  type="button"
                  disabled={!!busy || loading}
                  onClick={() => pick(t)}
                  title={OS_RULE_TEXT[t]}
                  className={`rounded-xl px-3 py-2.5 text-left ring-1 transition-colors disabled:opacity-50 ${
                    f?.saved ? "bg-emerald-50 ring-emerald-200 active:bg-emerald-100" : "bg-blue-600 text-white ring-blue-600 active:bg-blue-700"
                  }`}
                >
                  <span className="block text-sm font-semibold">
                    {busy === t ? "검증 중…" : `📂 ${OS_FILE_LABEL[t]}`}
                  </span>
                  <span className={`mt-0.5 block truncate text-[11px] ${f?.saved ? "text-emerald-800" : "text-blue-100"}`}>
                    {f?.saved ? `✓ ${fmtAt(f.at!)} · ${f.vehicles}대 중 충족 ${f.ok}대` : loading ? "…" : "파일 없음 — 눌러서 올리기"}
                  </span>
                </button>
              );
            })}
          </div>
          {error && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          {loading && <p className="py-6 text-center text-sm text-gray-400">불러오는 중…</p>}

          {res && cur && (
            <>
              {/* 센터 선택 */}
              <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
                {[...centerNames, "전체"].map((c) => {
                  const on = center === c || (c === "전체" && !centerNames.includes(center));
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCenter(c === "전체" ? "__all" : c)}
                      className={`shrink-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold ring-1 ${on ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-gray-700 ring-black/5"}`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>

              {/* 요약 */}
              <div className="mt-3 rounded-2xl bg-gray-50 p-3">
                <div className="flex items-end justify-between">
                  <p className="text-3xl font-bold tabular-nums text-gray-900">
                    {pct(cur.all, cur.total)}
                    <span className="text-base text-gray-400">%</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    <b className="text-green-600">{cur.all}</b> / {cur.total}대 전부 완료
                  </p>
                </div>
                <ul className="mt-2 space-y-1.5 text-xs">
                  {[
                    ["① 웹 체크 완료", cur.web],
                    ["② 자산등록(장애목록)", cur.asset],
                    ["③ OS버전 충족", cur.os],
                  ].map(([l, n]) => (
                    <li key={String(l)} className="flex items-center gap-2">
                      <span className="w-32 shrink-0 text-gray-700">{l}</span>
                      {bar(Number(n), cur.total)}
                      <span className="w-16 shrink-0 text-right tabular-nums text-gray-500">
                        {n}/{cur.total}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 센터별 표(전체 보기일 때) */}
              {!centerNames.includes(center) && res.centers.length > 1 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {res.centers.map((c) => (
                    <li key={c.label} className="flex justify-between gap-2 rounded-lg bg-white px-2 py-1.5 ring-1 ring-black/5">
                      <span className="font-semibold text-gray-800">{c.label}</span>
                      <span className="tabular-nums text-gray-500">
                        전부 {c.all}/{c.total} · 웹 {c.web} · 자산 {c.asset} · OS {c.os}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {/* 미완료 목록(센터 선택 시) */}
              {centerNames.includes(center) && (
                <>
                  <p className="mt-3 text-xs font-semibold text-gray-500">
                    {center} 미완료 {pendingAll.length}대 <span className="font-normal text-gray-400">(▢ = 안 됨, ✅ = 됨 · 순서: 웹·자산·OS)</span>
                  </p>
                  <ul className="mt-1.5 divide-y divide-gray-100 rounded-2xl bg-white ring-1 ring-black/5">
                    {pending.map((i) => (
                      <li key={i.plate} className="px-3 py-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-900">{i.plate}</span>
                          <span className="shrink-0 tabular-nums">
                            {mark(i.web)} {mark(i.asset)} {mark(i.os)}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-gray-500">
                          {i.operator} · {shortRoute(i.route)} · {i.model || "기종?"} · OS {i.osInfo}
                        </p>
                      </li>
                    ))}
                    {pendingAll.length === 0 && <li className="px-3 py-4 text-center text-xs text-green-700">✅ 이 센터 전 차량 완료</li>}
                  </ul>
                  {pendingAll.length > LIST_MAX && !showAll && (
                    <button type="button" onClick={() => setShowAll(true)} className="mt-2 w-full rounded-xl bg-gray-100 py-2 text-xs font-medium text-gray-700">
                      나머지 {pendingAll.length - LIST_MAX}대 더 보기
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 border-t border-gray-100 p-4">
          <button
            type="button"
            disabled={!res}
            onClick={() => downloadUrl("/api/handover/osverify?format=xlsx")}
            className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white active:bg-emerald-700 disabled:opacity-40"
          >
            📥 검증 결과 엑셀 다운로드
          </button>
        </div>
      </div>
    </div>
  );
}
