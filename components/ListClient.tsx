"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EXPORT_CHUNK } from "@/lib/export/limits";

export interface ListItem {
  plate: string;
  operator: string;
  route: string;
  installDate: string;
  savedDate: string; // 완료 업무일 (20:00~익일 12:00 기준)
  year: string;
  model: string;
  photoCount: number;
  target: number; // 이 차량의 총 촬영수량 — '단말기 없음' 칸만큼 14에서 차감됨
}

interface ExportResult {
  ok: boolean;
  folder: string;
  name: string;
  link: string;
  folderLink: string;
  count: number;
}

export default function ListClient({
  items,
  operators,
}: {
  items: ListItem[];
  operators: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | "pdf" | "xlsx">(null);
  const [progress, setProgress] = useState("");
  // 저장 완료 안내(드라이브 링크). 모바일 팝업 차단을 피해 화면에 직접 링크를 띄운다.
  const [result, setResult] = useState<{ text: string; url: string } | null>(null);
  const [query, setQuery] = useState("");
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [operator, setOperator] = useState("");
  const [dateFilter, setDateFilter] = useState(""); // 완료 업무일 필터

  // 검색(차량번호·운수사·노선·완료일) + 미완료/날짜 필터
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (incompleteOnly && it.photoCount >= it.target) return false;
      if (dateFilter && it.savedDate !== dateFilter) return false;
      if (!q) return true;
      return (
        it.plate.toLowerCase().includes(q) ||
        it.operator.toLowerCase().includes(q) ||
        it.route.toLowerCase().includes(q) ||
        it.savedDate.includes(q)
      );
    });
  }, [items, query, incompleteOnly, dateFilter]);

  const incompleteCount = useMemo(
    () => items.filter((it) => it.photoCount < it.target).length,
    [items],
  );

  const allChecked =
    filtered.length > 0 && filtered.every((it) => selected.has(it.plate));
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
    setSelected((s) => {
      const n = new Set(s);
      if (allChecked) filtered.forEach((it) => n.delete(it.plate));
      else filtered.forEach((it) => n.add(it.plate));
      return n;
    });
  }

  // 차량들을 EXPORT_CHUNK 단위로 나눠 순차 업로드 (서버 한계 회피, 큰 운수사 자동 분할)
  async function runExport(
    kind: "pdf" | "xlsx",
    plates: string[],
    titlePrefix: string,
  ): Promise<ExportResult[]> {
    const chunks: string[][] = [];
    for (let i = 0; i < plates.length; i += EXPORT_CHUNK) {
      chunks.push(plates.slice(i, i + EXPORT_CHUNK));
    }
    const results: ExportResult[] = [];
    for (let i = 0; i < chunks.length; i++) {
      setProgress(
        chunks.length > 1
          ? `${i + 1}/${chunks.length} 파일 저장 중… (${kind === "pdf" ? "PDF" : "엑셀"})`
          : `${kind === "pdf" ? "PDF" : "엑셀"} 저장 중…`,
      );
      const title = chunks.length > 1 ? `${titlePrefix}_${i + 1}of${chunks.length}` : titlePrefix;
      const res = await fetch(`/api/export/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plates: chunks[i], title }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "생성 실패");
      results.push(j as ExportResult);
    }
    return results;
  }

  function finishExport(results: ExportResult[], label?: string, count?: number) {
    const first = results[0];
    if (!first) return;
    const multi = results.length > 1;
    const head = label ? `${label} ${count ?? ""}대 — ` : "";
    const text = multi
      ? `${head}드라이브 '${first.folder}' 폴더에 ${results.length}개 파일로 저장되었습니다.`
      : `드라이브 '${first.folder}' 폴더에 저장되었습니다. (${first.name})`;
    const url = (multi ? first.folderLink : first.link) ?? "";
    setResult({ text, url });
  }

  async function downloadSelected(kind: "pdf" | "xlsx") {
    if (selectedPlates.length === 0) {
      alert("저장할 차량을 선택하세요.");
      return;
    }
    setBusy(kind);
    try {
      const results = await runExport(kind, selectedPlates, "B820_설치사진첩");
      finishExport(results);
    } catch (e) {
      alert(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setBusy(null);
      setProgress("");
    }
  }

  async function downloadOperator(kind: "pdf" | "xlsx") {
    if (!operator) {
      alert("운수사를 선택하세요.");
      return;
    }
    setBusy(kind);
    setProgress("차량 목록 불러오는 중…");
    try {
      const r = await fetch(`/api/export/operator-plates?operator=${encodeURIComponent(operator)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "차량 목록 조회 실패");
      const plates: string[] = j.plates ?? [];
      if (plates.length === 0) {
        alert("이 운수사에 사진이 있는 차량이 없습니다.");
        return;
      }
      const results = await runExport(kind, plates, operator);
      finishExport(results, operator, plates.length);
    } catch (e) {
      alert(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setBusy(null);
      setProgress("");
    }
  }

  return (
    <div>
      {/* 운수사별 저장 */}
      {operators.length > 0 && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
          <div className="mb-1.5 text-xs font-medium text-blue-800">
            운수사별 저장 <span className="font-normal text-blue-500">(사진 있는 차량 전체)</span>
          </div>
          <div className="flex gap-1.5">
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              disabled={busy !== null}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
            >
              <option value="">운수사 선택…</option>
              {operators.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <button
              onClick={() => downloadOperator("pdf")}
              disabled={busy !== null || !operator}
              className="shrink-0 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white active:bg-rose-700 disabled:opacity-40"
            >
              PDF
            </button>
            <button
              onClick={() => downloadOperator("xlsx")}
              disabled={busy !== null || !operator}
              className="shrink-0 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white active:bg-green-700 disabled:opacity-40"
            >
              엑셀
            </button>
          </div>
          <p className="mt-1 text-[11px] text-blue-500">
            차량이 많으면 자동으로 {EXPORT_CHUNK}대씩 여러 파일로 나눠 저장돼요.
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <p className="mt-12 text-center text-sm text-gray-400">
          저장된 사진첩이 없습니다.
          <br />
          차량을 선택해 사진을 올린 뒤 “저장”을 누르세요.
        </p>
      ) : (
        <>
          {/* 검색 + 미완료 필터 */}
          <div className="mb-3 space-y-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="차량번호 · 운수사 · 노선 · 완료일 검색"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            {/* 완료일(업무일) 검색 */}
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-gray-500">완료일</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              {dateFilter && (
                <button
                  onClick={() => setDateFilter("")}
                  className="shrink-0 rounded-lg bg-gray-100 px-2.5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200"
                >
                  해제
                </button>
              )}
            </div>
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-1.5 text-gray-600">
                <input
                  type="checkbox"
                  checked={incompleteOnly}
                  onChange={(e) => setIncompleteOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                미완료만 보기
              </label>
              <span className="text-gray-400">
                {incompleteCount > 0 ? (
                  <span className="font-medium text-rose-600">미완료 {incompleteCount}대</span>
                ) : (
                  <span className="text-green-600">전체 완료</span>
                )}
                {" · "}
                {filtered.length}/{items.length}대
              </span>
            </div>
          </div>

          <label className="mb-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4" />
            전체 선택 (선택 {selected.size}개)
          </label>

          {filtered.length === 0 ? (
            <p className="mt-12 text-center text-sm text-gray-400">검색 결과가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {filtered.map((it) => {
                const done = it.photoCount >= it.target;
                return (
                  <li key={it.plate} className="flex items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(it.plate)}
                      onChange={() => toggle(it.plate)}
                      className="h-4 w-4 shrink-0"
                    />
                    <Link href={`/record/${encodeURIComponent(it.plate)}`} className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{it.plate}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className={`text-xs tabular-nums ${done ? "text-gray-400" : "text-rose-600"}`}>
                            {String(it.photoCount).padStart(2, "0")}장/{it.target}장
                          </span>
                          {done ? (
                            <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                              완료
                            </span>
                          ) : (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                              미완료
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        {it.operator} · {it.route}
                        {it.savedDate ? ` · 완료 ${it.savedDate}` : ""}
                        {it.year || it.model ? ` · ${it.year} ${it.model}` : ""}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* 저장 완료 안내 — 팝업 대신 직접 탭하는 링크(모바일 팝업 차단 회피) */}
      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-sm text-gray-700">{result.text}</p>
            <div className="mt-4 flex flex-col gap-2">
              {result.url && (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setResult(null)}
                  className="rounded-lg bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white active:bg-blue-700"
                >
                  드라이브에서 열기
                </a>
              )}
              <button
                onClick={() => setResult(null)}
                className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-600 active:bg-gray-200"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 진행 상태 표시 */}
      {busy && progress && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4">
          <div className="rounded-full bg-gray-800 px-4 py-2 text-xs font-medium text-white shadow-lg">
            {progress}
          </div>
        </div>
      )}

      {/* 하단 고정: 선택 차량 저장 */}
      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-2">
            <button
              onClick={() => downloadSelected("pdf")}
              disabled={busy !== null}
              className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-semibold text-white active:bg-rose-700 disabled:opacity-50"
            >
              {busy === "pdf" ? "PDF 저장 중…" : `선택 PDF 저장${selected.size ? ` (${selected.size})` : ""}`}
            </button>
            <button
              onClick={() => downloadSelected("xlsx")}
              disabled={busy !== null}
              className="rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white active:bg-green-700 disabled:opacity-50"
            >
              {busy === "xlsx" ? "엑셀 저장 중…" : `선택 엑셀 저장${selected.size ? ` (${selected.size})` : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
