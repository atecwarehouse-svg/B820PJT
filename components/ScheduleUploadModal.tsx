"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface ChangeGroup {
  operator: string;
  from: string | null;
  to: string | null;
  count: number;
}

interface UploadResult {
  applied: boolean;
  updated?: number; // 적용 시에만
  total: number;
  withDate: number;
  pilot: number;
  skipped: number;
  added: number;
  changedCount: number;
  changes: ChangeGroup[];
}

// "2026-07-10" → "7/10", null → "미정"
function fmtDate(d: string | null): string {
  if (!d) return "미정";
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

// '설치일정 변경 업로드' 버튼 → 팝업(모달).
// 1) 파일 선택 → 변경 내역 미리보기(DB 미변경) → 2) '변경 반영' 확인 시 실제 반영.
export default function ScheduleUploadModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"select" | "preview" | "done">("select");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pw, setPw] = useState(""); // 관리자 비밀번호
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function reset() {
    setStep("select");
    setBusy(false);
    setError(null);
    setResult(null);
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    setOpen(false);
    reset();
    setPw(""); // 닫으면 비밀번호도 초기화
  }

  // 1단계: 파일 선택 → 미리보기(apply 없이)
  async function handlePreview(f: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", f);
      form.append("pw", pw);
      const res = await fetch("/api/import/schedule", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "업로드 실패");
      setFile(f);
      setResult(json as UploadResult);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setBusy(false);
    }
  }

  // 2단계: 확인 → 실제 반영(apply=true)
  async function handleApply() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("apply", "true");
      form.append("pw", pw);
      const res = await fetch("/api/import/schedule", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "반영 실패");
      setResult(json as UploadResult);
      setStep("done");
      router.refresh(); // 대시보드 일정/계획수량 갱신
    } catch (e) {
      setError(e instanceof Error ? e.message : "반영 실패");
    } finally {
      setBusy(false);
    }
  }

  // 변경 내역 목록 (preview·done 공용)
  function ChangeList() {
    if (!result) return null;
    return result.changedCount > 0 ? (
      <div className="mt-3 max-h-60 overflow-y-auto rounded-lg border border-gray-100">
        <p className="border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] font-semibold text-gray-500">
          일정 변경 내역
        </p>
        <ul className="divide-y divide-gray-50">
          {result.changes.map((c, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
            >
              <span className="min-w-0 truncate font-medium text-gray-700">
                {c.operator}
                <span className="ml-1 font-normal text-gray-400">{c.count}대</span>
              </span>
              <span className="shrink-0 tabular-nums text-gray-500">
                {fmtDate(c.from)}
                <span className="mx-1 text-blue-500">→</span>
                <b className="text-blue-700">{fmtDate(c.to)}</b>
              </span>
            </li>
          ))}
        </ul>
      </div>
    ) : (
      <p className="mt-3 rounded-lg bg-gray-50 py-3 text-center text-xs text-gray-400">
        변경된 일정이 없습니다.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 shadow-sm transition-colors hover:bg-blue-50"
      >
        설치일정 변경 업로드
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="mt-12 w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-bold text-blue-700">
                {step === "preview"
                  ? "변경 내용 확인"
                  : step === "done"
                    ? "반영 완료"
                    : "설치일정 변경 업로드"}
              </h2>
              <button
                onClick={close}
                className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              {step === "select" && (
                // 1단계: 파일 선택
                <>
                  <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
                    <p className="font-semibold text-blue-700">수정 방법</p>
                    <p className="mt-1">
                      다운로드한 진행현황 엑셀의 <b>「차량리스트」 시트</b>에서{" "}
                      <b>I열(설치 예정일)</b>을 바꾼 뒤 그 파일을 올려주세요.
                    </p>
                    <p className="mt-1 text-gray-500">
                      날짜만 바꾸면 됩니다. <b>계획수량</b>은 예정일에서 자동으로 계산되어
                      일정·다운로드(계획수량 기본값)에 함께 반영되므로 따로 입력할 필요가 없습니다.
                      (시범설치는 「진행현황」 시트 비고 기준)
                    </p>
                  </div>

                  <label className="mt-3 block">
                    <span className="text-[11px] font-medium text-gray-500">관리자 비밀번호</span>
                    <input
                      type="password"
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                      placeholder="비밀번호 입력"
                      autoComplete="off"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy || !pw}
                    className="mt-3 flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-blue-300 px-4 py-6 text-blue-500 active:bg-blue-50 disabled:opacity-50"
                  >
                    <span className="text-2xl">⬆️</span>
                    <span className="text-sm font-medium">
                      {busy ? "분석 중…" : "엑셀 파일 선택"}
                    </span>
                  </button>

                  {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = ""; // 비밀번호 오류 후 같은 파일 재선택도 인식되도록
                      if (f) handlePreview(f);
                    }}
                  />
                </>
              )}

              {step === "preview" && result && (
                // 2단계: 변경 내용 확인 → 반영 여부 결정
                <>
                  <p className="text-xs text-gray-500">
                    아래 내용으로 일정을 변경합니다. 확인 후 <b>변경 반영</b>을 눌러주세요.
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    총 {result.total.toLocaleString()}대 · 일정 변경{" "}
                    <b className="text-blue-700">{result.changedCount.toLocaleString()}대</b>
                    {result.added > 0 && <> · 신규 {result.added.toLocaleString()}대</>}
                  </p>

                  <ChangeList />

                  {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={reset}
                      disabled={busy}
                      className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                    >
                      다시 선택
                    </button>
                    <button
                      onClick={handleApply}
                      disabled={busy}
                      className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {busy ? "반영 중…" : "변경 반영"}
                    </button>
                  </div>
                </>
              )}

              {step === "done" && result && (
                // 3단계: 반영 완료
                <div>
                  <div className="text-center">
                    <div className="text-3xl">✅</div>
                    <p className="mt-2 text-base font-bold text-gray-800">반영 완료</p>
                    <p className="mt-1 text-xs text-gray-500">
                      차량 {(result.updated ?? result.total).toLocaleString()}대 반영 · 일정 변경{" "}
                      <b className="text-blue-700">{result.changedCount.toLocaleString()}대</b>
                      {result.added > 0 && <> · 신규 {result.added.toLocaleString()}대</>}
                    </p>
                  </div>

                  <ChangeList />

                  <button
                    onClick={close}
                    className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    확인
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
