"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface UploadResult {
  updated: number;
  withDate: number;
  pilot: number;
  skipped: number;
}

// '설치일정 변경 업로드' 버튼 → 팝업(모달).
// 수정한 진행현황 xlsx를 올리면 차량리스트의 설치 예정일/시범설치를 DB에 반영.
export default function ScheduleUploadModal() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function reset() {
    setBusy(false);
    setError(null);
    setResult(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/schedule", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "업로드 실패");
      setResult(json as UploadResult);
      router.refresh(); // 대시보드 일정/계획수량 갱신
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setBusy(false);
    }
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
              <h2 className="text-sm font-bold text-blue-700">설치일정 변경 업로드</h2>
              <button
                onClick={close}
                className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              {result ? (
                // 완료 화면
                <div className="text-center">
                  <div className="text-3xl">✅</div>
                  <p className="mt-2 text-base font-bold text-gray-800">반영 완료</p>
                  <p className="mt-1 text-xs text-gray-500">
                    차량 {result.updated.toLocaleString()}대 반영 · 예정일 있음{" "}
                    {result.withDate.toLocaleString()}대
                    {result.pilot > 0 && <> · 시범설치 {result.pilot.toLocaleString()}대</>}
                    {result.skipped > 0 && (
                      <> · 빈칸 제외 {result.skipped.toLocaleString()}행</>
                    )}
                  </p>
                  <button
                    onClick={close}
                    className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    확인
                  </button>
                </div>
              ) : (
                // 업로드 화면
                <>
                  <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
                    <p className="font-semibold text-blue-700">수정 방법</p>
                    <p className="mt-1">
                      다운로드한 진행현황 엑셀의 <b>「차량리스트」 시트</b>에서{" "}
                      <b>I열(설치 예정일)</b>을 바꾼 뒤 그 파일을 올려주세요.
                    </p>
                    <p className="mt-1 text-gray-500">
                      날짜를 바꾸면 그 날짜의 <b>계획 수량</b>도 자동으로 반영됩니다.
                      (시범설치는 「진행현황」 시트 비고 기준)
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="mt-4 flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-blue-300 px-4 py-6 text-blue-500 active:bg-blue-50 disabled:opacity-50"
                  >
                    <span className="text-2xl">⬆️</span>
                    <span className="text-sm font-medium">
                      {busy ? "반영 중…" : "엑셀 파일 선택"}
                    </span>
                    {fileName && !busy && (
                      <span className="max-w-full truncate text-[11px] text-gray-400">
                        {fileName}
                      </span>
                    )}
                  </button>

                  {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setFileName(f.name);
                        handleFile(f);
                      }
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
