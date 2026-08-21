"use client";

import { useEffect, useState } from "react";
import { downloadUrl } from "@/lib/download";
import { workDateString } from "@/lib/work-day";

// 홈 '노선 스크린샷' 버튼 — 그날 설치한 노선을 골라, 인천버스정보 + 카카오맵 두 화면을
// 한 장으로 붙인 이미지를 받는다(폰에서 분할화면 띄워 캡처하던 것을 대신).
// 첫차 전이라 아직 버스가 안 다니는 노선은 '차량출발대기중(첫차시각)'으로 표시해
// 헛캡처를 막는다. 첫차는 주중/토/일 시각을 구분해서 본다.

interface RouteRow {
  operator: string;
  route: string;
  routeNo: string;
  count: number;
  routeId?: string;
  origin?: string;
  dest?: string;
  firstTime?: string;
  running?: number;
  mine?: number;
  status: "running" | "waiting" | "none" | "nomatch" | "error";
  statusText: string;
}

const BADGE: Record<RouteRow["status"], string> = {
  running: "bg-emerald-100 text-emerald-700",
  waiting: "bg-amber-100 text-amber-700",
  none: "bg-gray-100 text-gray-600",
  nomatch: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
};

export default function RouteShotButton() {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => workDateString(new Date()));
  const [rows, setRows] = useState<RouteRow[] | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null); // 캡처 중인 노선
  const [done, setDone] = useState<string[]>([]);
  const [failed, setFailed] = useState<Record<string, string>>({});
  // 받은 캡처 — 미리보기 + '폰에 저장'(공유시트) 용
  const [shots, setShots] = useState<{ key: string; name: string; url: string; file: File }[]>([]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setRows(null);
    setError("");
    setPicked(new Set());
    setDone([]);
    setFailed({});
    setShots([]);
    (async () => {
      try {
        const res = await fetch(`/api/route-shot?date=${encodeURIComponent(date)}`, {
          cache: "no-store",
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error ?? "노선을 불러오지 못했습니다.");
        if (!alive) return;
        const list = (j.routes ?? []) as RouteRow[];
        setRows(list);
        setPicked(new Set(list.map((r) => `${r.operator}|||${r.route}`)));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "노선을 불러오지 못했습니다.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, date]);

  function toggle(key: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // 한 노선씩 순서대로 — 캡처에 20~30초씩 걸려 한 번에 몰아 보내면 타임아웃 난다.
  async function download() {
    const targets = (rows ?? []).filter((r) => picked.has(`${r.operator}|||${r.route}`));
    setFailed({});
    setDone([]);
    for (const r of targets) {
      const key = `${r.operator}|||${r.route}`;
      setBusy(key);
      const url =
        `/api/route-shot/image?route=${encodeURIComponent(r.route)}` +
        `&operator=${encodeURIComponent(r.operator)}` +
        (r.routeId ? `&routeId=${encodeURIComponent(r.routeId)}` : "");
      try {
        // 실패는 JSON으로 오므로 먼저 확인하고, 성공이면 같은 URL을 다운로드로 연다
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error ?? "캡처 실패");
        }
        const blob = await res.blob();
        const name = `노선확인_${r.operator || "노선"}_${r.routeNo}.png`;
        const file = new File([blob], name, { type: "image/png" });
        setShots((list) => [...list, { key, name, url: URL.createObjectURL(blob), file }]);
        setDone((d) => [...d, key]);
      } catch (e) {
        setFailed((f) => ({ ...f, [key]: e instanceof Error ? e.message : "캡처 실패" }));
      }
    }
    setBusy(null);
  }

  // 폰에 저장 — 공유시트(사진 앱 저장)를 우선 쓰고, 안 되면 파일 다운로드.
  // (사진 촬영 화면과 같은 방식 — 홈화면 앱에서 자동 다운로드는 화면을 덮어버린다)
  async function saveShot(shot: { name: string; url: string; file: File }) {
    if (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [shot.file] })
    ) {
      try {
        await navigator.share({ files: [shot.file] });
        return;
      } catch {
        return; // 공유시트를 닫은 경우
      }
    }
    downloadUrl(shot.url);
  }

  const pickedCount = picked.size;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-2 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-center text-sm font-semibold text-indigo-700 shadow-sm active:bg-indigo-100"
      >
        🚌 노선 스크린샷
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="mb-12 mt-8 w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between rounded-t-2xl bg-indigo-600 px-4 py-3 text-white">
              <div>
                <p className="text-sm font-bold">🚌 노선 스크린샷</p>
                <p className="text-xs text-indigo-200">
                  인천버스정보 + 카카오맵을 한 장으로
                </p>
              </div>
              <button
                onClick={() => !busy && setOpen(false)}
                disabled={!!busy}
                className="rounded-md px-2 py-0.5 text-lg leading-none text-indigo-100 active:bg-indigo-700 disabled:opacity-40"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">설치일</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={!!busy}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </label>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
              )}
              {!rows && !error && (
                <p className="py-6 text-center text-sm text-gray-500">노선 확인 중…</p>
              )}
              {rows && rows.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-500">
                  이 날짜에 설치 예정인 노선이 없습니다.
                </p>
              )}

              {rows && rows.length > 0 && (
                <>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>노선 {rows.length}개 · 선택 {pickedCount}개</span>
                    <button
                      onClick={() =>
                        setPicked((s) =>
                          s.size === rows.length
                            ? new Set()
                            : new Set(rows.map((r) => `${r.operator}|||${r.route}`)),
                        )
                      }
                      className="rounded-md border border-gray-300 px-2 py-1 active:bg-gray-100"
                    >
                      {pickedCount === rows.length ? "전체 해제" : "전체 선택"}
                    </button>
                  </div>

                  <ul className="max-h-[45vh] space-y-1.5 overflow-y-auto">
                    {rows.map((r) => {
                      const key = `${r.operator}|||${r.route}`;
                      return (
                        <li
                          key={key}
                          className="flex items-start gap-2 rounded-lg border border-gray-200 px-2.5 py-2"
                        >
                          <input
                            type="checkbox"
                            checked={picked.has(key)}
                            onChange={() => toggle(key)}
                            disabled={!!busy}
                            className="mt-1 h-4 w-4 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-800">
                              {r.route}{" "}
                              <span className="font-normal text-gray-500">
                                · {r.operator} · {r.count}대
                              </span>
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${BADGE[r.status]}`}
                              >
                                {r.statusText}
                              </span>
                              {busy === key && (
                                <span className="text-[11px] text-indigo-600">캡처 중…</span>
                              )}
                              {done.includes(key) && (
                                <span className="text-[11px] text-emerald-600">받음 ✓</span>
                              )}
                              {failed[key] && (
                                <span className="text-[11px] text-red-600">{failed[key]}</span>
                              )}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <button
                    onClick={download}
                    disabled={!!busy || pickedCount === 0}
                    className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white active:bg-indigo-700 disabled:opacity-50"
                  >
                    {busy
                      ? `캡처 중… (${done.length}/${pickedCount})`
                      : `선택한 ${pickedCount}개 노선 캡처 받기`}
                  </button>
                  <p className="text-center text-[11px] text-gray-400">
                    노선 1개당 20~30초 걸립니다 · 받는 동안 창을 닫지 마세요
                  </p>

                  {shots.length > 0 && (
                    <div className="space-y-3 border-t border-gray-200 pt-3">
                      <p className="text-xs font-semibold text-gray-600">
                        캡처 {shots.length}장 — 눌러서 폰에 저장
                      </p>
                      {shots.map((s) => (
                        <div key={s.key} className="rounded-lg border border-gray-200 p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={s.url} alt={s.name} className="w-full rounded" />
                          <button
                            onClick={() => saveShot(s)}
                            className="mt-2 w-full rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 active:bg-indigo-100"
                          >
                            📥 폰에 저장
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
