"use client";

import { useState } from "react";

const INPUT =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

// 체크 항목 한 줄 — 큰 체크박스 + 라벨(+ 설명)
function CheckRow({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 active:bg-gray-100">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-800">{label}</span>
        {desc && <span className="mt-0.5 block text-[11px] text-gray-500">{desc}</span>}
      </span>
    </label>
  );
}

// '운행시작 보고' 버튼 → 팝업 점검 폼 → 팀즈(설치 진행중 공유방) 카드 전송.
// 첫차 운행시작 전 운전자 교육·요금세팅·BIS·카카오 점검 결과를 공유한다.
export default function ServiceStartModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [driverEdu, setDriverEdu] = useState(false);
  const [fareSetting, setFareSetting] = useState(false);
  const [baseFare, setBaseFare] = useState("");
  const [bisCheck, setBisCheck] = useState(false);
  const [kakaoCheck, setKakaoCheck] = useState(false);
  const [notes, setNotes] = useState("");

  function reset() {
    setStep("form");
    setBusy(false);
    setError(null);
    setDriverEdu(false);
    setFareSetting(false);
    setBaseFare("");
    setBisCheck(false);
    setKakaoCheck(false);
    setNotes("");
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/service-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverEdu,
          fareSetting,
          baseFare,
          bisCheck,
          kakaoCheck,
          notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "전송 실패");
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
      >
        운행시작 보고
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="mb-12 mt-8 w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-bold text-emerald-700">
                {step === "done" ? "전송 완료" : "🚍 운행시작 보고"}
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
              {step === "done" ? (
                <div className="py-6 text-center">
                  <p className="text-3xl">✅</p>
                  <p className="mt-2 text-sm font-semibold text-gray-700">
                    팀즈로 전송했습니다
                  </p>
                  <p className="mt-1 text-xs text-gray-400">설치 진행중 공유방으로 발송됨</p>
                  <button
                    type="button"
                    onClick={close}
                    className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white active:bg-emerald-700"
                  >
                    확인
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-700">
                    첫차 운행시작 전 점검 결과를 공유합니다
                  </p>

                  <CheckRow
                    checked={driverEdu}
                    onChange={setDriverEdu}
                    label="첫차 운행시작 · 운전자 교육 완료"
                  />

                  <CheckRow
                    checked={fareSetting}
                    onChange={setFareSetting}
                    label="단말기 요금세팅 확인"
                    desc="다인승 조작으로 기본요금 확인"
                  />

                  <label className="block">
                    <span className="text-[11px] font-medium text-gray-500">
                      기본요금 (원)
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={baseFare}
                      onChange={(e) => setBaseFare(e.target.value)}
                      placeholder="예: 1500"
                      className={INPUT}
                    />
                    <span className="mt-1 block text-[11px] text-gray-400">
                      버스 문에 붙어있는 요금과 동일한지 확인
                    </span>
                  </label>

                  <CheckRow
                    checked={bisCheck}
                    onChange={setBisCheck}
                    label="BIS 서비스 확인"
                    desc="인천시 버스 도착정보 서비스 정상 확인"
                  />

                  <CheckRow
                    checked={kakaoCheck}
                    onChange={setKakaoCheck}
                    label="카카오 초정밀 버스 정상 유무"
                  />

                  <label className="block">
                    <span className="text-[11px] font-medium text-gray-500">특이사항</span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="점검 중 나온 특이사항"
                      className={INPUT}
                    />
                  </label>

                  {error && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                      {error}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={busy}
                    className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white active:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy ? "전송 중..." : "팀즈로 보내기"}
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
