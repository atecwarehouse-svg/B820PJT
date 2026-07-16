"use client";

import { useState } from "react";

type Status = "" | "ok" | "issue";

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

// 이상없음/이상 선택 + 이상 시 증상 입력 (BIS·카카오)
function StatRow({
  label,
  desc,
  status,
  onStatus,
  symptom,
  onSymptom,
}: {
  label: string;
  desc?: string;
  status: Status;
  onStatus: (v: Status) => void;
  symptom: string;
  onSymptom: (v: string) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
      <p className="text-sm font-medium text-gray-800">{label}</p>
      {desc && <p className="mt-0.5 text-[11px] text-gray-500">{desc}</p>}
      <div className="mt-1.5 flex gap-2">
        <button
          type="button"
          onClick={() => onStatus("ok")}
          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${
            status === "ok"
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-gray-300 bg-white text-gray-600"
          }`}
        >
          이상없음
        </button>
        <button
          type="button"
          onClick={() => onStatus("issue")}
          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${
            status === "issue"
              ? "border-red-500 bg-red-500 text-white"
              : "border-gray-300 bg-white text-gray-600"
          }`}
        >
          이상
        </button>
      </div>
      {status === "issue" && (
        <input
          type="text"
          value={symptom}
          onChange={(e) => onSymptom(e.target.value)}
          placeholder="증상 입력 (예: 도착정보 미표시)"
          className="mt-1.5 w-full rounded-lg border border-red-300 px-2.5 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
      )}
    </div>
  );
}

// '운행시작 보고' 버튼 → 점검 폼 팝업 → 팀즈(설치 진행중 공유방) 카드 전송.
// 금일완료 리포트의 운행시작 점검과 항목은 같지만, 첫차 운행 직후 바로 공유하는 별도 창구.
export default function ServiceStartModal() {
  const INPUT =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [driverEdu, setDriverEdu] = useState(false);
  const [fareSetting, setFareSetting] = useState(false);
  const [baseFare, setBaseFare] = useState("");
  const [bisStatus, setBisStatus] = useState<Status>("");
  const [bisSymptom, setBisSymptom] = useState("");
  const [kakaoStatus, setKakaoStatus] = useState<Status>("");
  const [kakaoSymptom, setKakaoSymptom] = useState("");
  const [notes, setNotes] = useState("");

  function close() {
    setOpen(false);
    setStep("form");
    setBusy(false);
    setError(null);
    setDriverEdu(false);
    setFareSetting(false);
    setBaseFare("");
    setBisStatus("");
    setBisSymptom("");
    setKakaoStatus("");
    setKakaoSymptom("");
    setNotes("");
  }

  async function handleSend() {
    if (bisStatus === "issue" && !bisSymptom.trim()) {
      setError("BIS 이상 증상을 입력하세요.");
      return;
    }
    if (kakaoStatus === "issue" && !kakaoSymptom.trim()) {
      setError("카카오(초정밀) 이상 증상을 입력하세요.");
      return;
    }
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
          bisStatus,
          bisSymptom,
          kakaoStatus,
          kakaoSymptom,
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
        🚍 운행시작 보고
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
                {step === "done" ? "전송 완료" : "🚍 첫 운행시작 전 점검사항 공유"}
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
                    label="첫차 운행시작 · 승무사원 교육 완료"
                  />

                  <CheckRow
                    checked={fareSetting}
                    onChange={setFareSetting}
                    label="단말기 요금세팅 확인"
                    desc="다인승 조작으로 기본요금 확인"
                  />

                  <label className="block">
                    <span className="text-[11px] font-medium text-gray-500">기본요금 (원)</span>
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

                  <StatRow
                    label="BIS(인천) 서비스"
                    desc="인천시 버스 도착정보 서비스 이상 유무"
                    status={bisStatus}
                    onStatus={setBisStatus}
                    symptom={bisSymptom}
                    onSymptom={setBisSymptom}
                  />

                  <StatRow
                    label="카카오(초정밀) 버스"
                    desc="초정밀 버스 정상 유무"
                    status={kakaoStatus}
                    onStatus={setKakaoStatus}
                    symptom={kakaoSymptom}
                    onSymptom={setKakaoSymptom}
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
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
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
