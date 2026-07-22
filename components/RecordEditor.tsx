"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RecordBundle } from "@/lib/types";
import {
  AFTER_SLOTS,
  buildBeforeSlots,
  buildCheckSlots,
  makeCustomSlotKey,
  makeCheckCustomSlotKey,
  type CustomSlot,
} from "@/lib/slots";
import { publicPhotoUrl } from "@/lib/photo-url";
import PhotoSlot from "@/components/PhotoSlot";

interface Props {
  plate: string;
  initial: RecordBundle;
  teamOptions?: string[]; // 설치팀 선택지 (관리자 페이지에서 관리, 비면 직접 입력)
}

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// 페이지(단계) 순서: 차량번호 입력(홈) → 이상유무 → 설치 전 → 설치 후
const STEPS = ["차량 이상유무", "설치 전", "설치 후"] as const;

export default function RecordEditor({ plate, initial, teamOptions = [] }: Props) {
  const vehicle = initial.vehicle!;
  const installDate = initial.record?.install_date ?? todayStr();

  const [operator, setOperator] = useState(
    initial.record?.operator ?? vehicle.operator,
  );
  const [route, setRoute] = useState(initial.record?.route ?? vehicle.route);
  // 연식·차종: 저장된 레코드값 우선, 없으면 차량 마스터(차량리스트 J/L열) 기본값. 수정 가능.
  const [year, setYear] = useState(initial.record?.year ?? vehicle.year ?? "");
  const [model, setModel] = useState(initial.record?.model ?? vehicle.model ?? "");
  const [team, setTeam] = useState(initial.record?.team ?? "");
  // 팀명 잠금 — 한번 저장된 팀명은 관리자 비밀번호를 입력해야 변경 가능(서버도 검증)
  const [teamLocked, setTeamLocked] = useState(!!(initial.record?.team ?? "").trim());
  const adminPwRef = useRef<string | null>(null); // 잠금 해제 시 입력한 관리자 비밀번호
  const [customSlots, setCustomSlots] = useState<CustomSlot[]>(
    initial.record?.custom_slots ?? [],
  );
  // 단말기 없음으로 표시한 슬롯키(하차 등) — 사진 없이도 충족 처리
  const [naSlots, setNaSlots] = useState<string[]>(initial.record?.na_slots ?? []);
  // 폐차 후 증차차량 — 설치전 칸 전체를 사진 없이 충족 처리(na_slots에 함께 기록),
  // PDF/엑셀 설치전 사진칸에는 '증차차량' 텍스트 표시
  const [addedVehicle, setAddedVehicle] = useState(
    initial.record?.added_vehicle ?? false,
  );
  // 차량 이상유무 '없음' 체크(장비 미장착) — 사진 없이 충족 처리
  const [checkNaSlots, setCheckNaSlots] = useState<string[]>(
    initial.record?.check_na_slots ?? [],
  );
  const [checkNote, setCheckNote] = useState(initial.record?.check_note ?? ""); // 이상유무 비고
  const [extraNote, setExtraNote] = useState(initial.record?.extra_note ?? ""); // 설치 특이사항
  const [editInfo, setEditInfo] = useState(false); // 운수사/노선 수정 모드

  // 현재 단계 (0=이상유무 · 1=설치 전 · 2=설치 후)
  // 다시 들어오면 저장된 사진·입력을 보고 완료된 단계는 건너뛰고 이어서 시작.
  const [step, setStep] = useState(() => {
    const rec = initial.record;
    const photoKeys = new Set(
      [...initial.photos, ...(initial.checkPhotos ?? [])].map((p) => p.slot_key),
    );
    const na = new Set(rec?.na_slots ?? []);
    const checkNa = new Set(rec?.check_na_slots ?? []);
    const customs = rec?.custom_slots ?? [];
    const checkDone =
      !!(rec?.team ?? "").trim() &&
      !!(rec?.check_note ?? "").trim() &&
      buildCheckSlots(customs).every(
        (s) => photoKeys.has(s.slotKey) || checkNa.has(s.slotKey),
      );
    if (!checkDone) return 0;
    const beforeDone = buildBeforeSlots(customs).every(
      (s) => photoKeys.has(s.slotKey) || na.has(s.slotKey),
    );
    return beforeDone ? 2 : 1;
  });
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  // slotKey -> 미리보기 URL (설치전/후 + 차량 이상유무 확인 사진)
  const [urls, setUrls] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const p of [...initial.photos, ...(initial.checkPhotos ?? [])]) {
      m[p.slot_key] = `${publicPhotoUrl(p.storage_path)}?t=${p.updated_at ?? ""}`;
    }
    return m;
  });

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  // 완료/실패 확인용 토스트 팝업 (2초 후 자동 사라짐)
  const [toast, setToast] = useState<
    { id: number; msg: string; type: "success" | "error" } | null
  >(null);
  const toastSeq = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback(
    (msg: string, type: "success" | "error" = "success") => {
      const id = ++toastSeq.current;
      setToast({ id, msg, type });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => {
        setToast((t) => (t && t.id === id ? null : t));
      }, 2000);
    },
    [],
  );
  // 커스텀 슬롯 번호 — 설치전(before_custom_N)·이상유무(check_custom_N) 공용 시퀀스
  const seqRef = useRef<number>(
    customSlots.reduce((max, c) => {
      const m = /_custom_(\d+)$/.exec(c.slot_key);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0),
  );

  const router = useRouter();
  const beforeSlots = useMemo(() => buildBeforeSlots(customSlots), [customSlots]);
  const checkSlots = useMemo(() => buildCheckSlots(customSlots), [customSlots]);

  const saveRecord = useCallback(
    async (
      overrides?: Partial<{
        operator: string;
        route: string;
        year: string;
        model: string;
        team: string;
        custom_slots: CustomSlot[];
        na_slots: string[];
        check_na_slots: string[];
        check_note: string;
        extra_note: string;
        added_vehicle: boolean;
        saved: boolean;
        mid: boolean;
        team_change: boolean;
      }>,
    ) => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plate,
            operator: overrides?.operator ?? operator,
            route: overrides?.route ?? route,
            year: overrides?.year ?? year,
            model: overrides?.model ?? model,
            team: overrides?.team ?? team,
            custom_slots: overrides?.custom_slots ?? customSlots,
            na_slots: overrides?.na_slots ?? naSlots,
            check_na_slots: overrides?.check_na_slots ?? checkNaSlots,
            check_note: overrides?.check_note ?? checkNote,
            extra_note: overrides?.extra_note ?? extraNote,
            added_vehicle: overrides?.added_vehicle ?? addedVehicle,
            saved: overrides?.saved ?? false,
            // 1·2단계 중간 저장 — 서버가 특이사항(3단계 입력란) 필수 검증을 건너뛴다
            ...(overrides?.mid ? { mid: true } : {}),
            // 팀명 칸에서 직접 바꾼 경우에만 잠금 검증 대상으로 표시
            ...(overrides?.team_change ? { team_change: true } : {}),
            // 팀명 변경 잠금 해제용 관리자 비밀번호 (있을 때만)
            ...(adminPwRef.current ? { admin_pw: adminPwRef.current } : {}),
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error ?? "저장에 실패했습니다");
        }
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
        // 최종 '저장'(saved=true)은 별도 안내가 있으므로 토스트 생략
        if (!overrides?.saved) showToast("저장되었습니다");
        return true;
      } catch (e) {
        setSaveState("error");
        showToast(e instanceof Error ? e.message : "저장에 실패했습니다", "error");
        return false;
      }
    },
    [
      plate,
      operator,
      route,
      year,
      model,
      team,
      customSlots,
      naSlots,
      checkNaSlots,
      checkNote,
      extraNote,
      addedVehicle,
      showToast,
    ],
  );

  // '단말기 없음' 토글 → 상태 갱신 후 저장(서버가 시작/완료 판정·팀즈 알림)
  function toggleNoTerminal(slotKey: string, value: boolean) {
    const next = value
      ? Array.from(new Set([...naSlots, slotKey]))
      : naSlots.filter((k) => k !== slotKey);
    setNaSlots(next);
    saveRecord({ na_slots: next });
  }

  // '증차차량' 토글 — 설치전 칸 전체(사진 있는 칸 제외)를 na_slots로 충족 처리.
  // 해제하면 이 토글이 추가한 없음 표시만 걷어낸다 — 사용자가 따로 체크해 둔
  // '단말기 없음'(하차 등)까지 지우지 않도록 추가분을 기억해 둔다.
  // (재접속 등으로 기억이 없으면 예전처럼 설치전 칸 전체를 걷어낸다.)
  const addedNaRef = useRef<string[] | null>(null);
  function toggleAddedVehicle(value: boolean) {
    const beforeKeys = beforeSlots.map((s) => s.slotKey);
    let next: string[];
    if (value) {
      const added = beforeKeys.filter((k) => !urls[k] && !naSlots.includes(k));
      addedNaRef.current = added;
      next = Array.from(new Set([...naSlots, ...added]));
    } else {
      const toRemove = new Set(addedNaRef.current ?? beforeKeys);
      addedNaRef.current = null;
      next = naSlots.filter((k) => !toRemove.has(k));
    }
    setAddedVehicle(value);
    setNaSlots(next);
    saveRecord({ added_vehicle: value, na_slots: next });
  }

  // 팀명 변경 — 선택 즉시 저장. 성공하면 잠금(이후 변경은 관리자 비밀번호 필요).
  async function changeTeam(v: string) {
    const prev = team;
    setTeam(v);
    const ok = await saveRecord({ team: v, team_change: true });
    if (ok) {
      if (v.trim()) {
        setTeamLocked(true);
        adminPwRef.current = null;
      }
    } else {
      setTeam(prev); // 실패(비밀번호 오류 등) → 원래 값으로 복구
      if (prev.trim()) setTeamLocked(true);
      adminPwRef.current = null;
    }
  }

  // 잠긴 팀명 변경 — 관리자 비밀번호 입력 후 잠금 해제(저장 시 서버가 재검증)
  function unlockTeam() {
    const pw = prompt("팀명 변경은 관리자만 가능합니다.\n관리자 비밀번호를 입력하세요.");
    if (!pw || !pw.trim()) return;
    adminPwRef.current = pw.trim();
    setTeamLocked(false);
  }

  // 차량 이상유무 '없음' 토글 — 사진 없이 충족 처리(설치시작 알림 조건에 반영)
  function toggleCheckNa(slotKey: string, value: boolean) {
    const next = value
      ? Array.from(new Set([...checkNaSlots, slotKey]))
      : checkNaSlots.filter((k) => k !== slotKey);
    setCheckNaSlots(next);
    saveRecord({ check_na_slots: next });
  }

  function toggleEditInfo() {
    if (editInfo) {
      // 완료 → 저장
      saveRecord();
    }
    setEditInfo((v) => !v);
  }

  const [submitting, setSubmitting] = useState(false);
  const [savedPopup, setSavedPopup] = useState(false); // 저장 완료 팝업
  const [midSavedPopup, setMidSavedPopup] = useState(false); // 중간 저장 완료 팝업

  // 1단계(이상유무) → 다음: 팀명·비고를 여기서 확인해 마지막에 몰아서 막히지 않게 한다
  function goNextFromCheck() {
    if (!team.trim()) {
      showToast(
        teamOptions.length > 0 ? "팀을 선택해주세요" : "팀명을 입력해주세요",
        "error",
      );
      return;
    }
    if (!checkNote.trim()) {
      showToast("비고(차량 이상유무)를 입력해주세요. 없으면 '없음'", "error");
      return;
    }
    setStep(1);
  }

  // 1·2단계 중간 저장 — 특이사항 없이도 여기까지 저장. 팀명·비고만 확인.
  // saved:true지만 mid:true라 서버가 완료일(saved_at)은 찍지 않는다(3단계 최종 저장 때 기록).
  // 팀즈 시작/완료 카드 판정은 기존 로직대로 처리.
  async function handleMidSave() {
    if (!team.trim()) {
      showToast(
        teamOptions.length > 0 ? "팀을 선택해주세요" : "팀명을 입력해주세요",
        "error",
      );
      return;
    }
    if (!checkNote.trim()) {
      showToast("비고(차량 이상유무)를 입력해주세요. 없으면 '없음'", "error");
      return;
    }
    setSubmitting(true);
    const ok = await saveRecord({ saved: true, mid: true });
    setSubmitting(false);
    if (ok) {
      setMidSavedPopup(true);
    } else {
      showToast("저장에 실패했습니다. 다시 시도해주세요", "error");
    }
  }

  async function handleSave() {
    if (!team.trim() || !checkNote.trim()) {
      // 앞 단계 입력이 비어 있으면(다른 탭 수정 등) 해당 단계로 되돌린다
      setStep(0);
      showToast(
        !team.trim()
          ? "팀명을 입력해야 저장할 수 있습니다"
          : "비고(차량 이상유무)를 입력해주세요. 없으면 '없음'",
        "error",
      );
      return;
    }
    if (!extraNote.trim()) {
      showToast("특이사항을 입력해주세요. 없으면 '없음'", "error");
      return;
    }
    setSubmitting(true);
    const ok = await saveRecord({ saved: true });
    setSubmitting(false);
    if (ok) {
      setSavedPopup(true);
    } else {
      showToast("저장에 실패했습니다. 다시 시도해주세요", "error");
    }
  }

  // 항목(칸) 추가 — 설치전(before)·차량 이상유무(check) 공용
  function addCustomSlot(section: "before" | "check") {
    const label = prompt("추가할 항목(칸) 이름을 입력하세요");
    if (!label || !label.trim()) return;
    seqRef.current += 1;
    const prefix = section === "check" ? "check_custom_" : "before_custom_";
    const next: CustomSlot = {
      slot_key:
        section === "check"
          ? makeCheckCustomSlotKey(seqRef.current)
          : makeCustomSlotKey(seqRef.current),
      label: label.trim(),
      sort_order: customSlots.filter((c) => c.slot_key.startsWith(prefix)).length,
    };
    const updated = [...customSlots, next];
    setCustomSlots(updated);
    saveRecord({ custom_slots: updated });
  }

  async function removeCustomSlot(slotKey: string) {
    if (!confirm("이 항목(칸)을 삭제할까요? 사진도 함께 삭제됩니다.")) return;
    // 사진 먼저 삭제
    await fetch(
      `/api/photos?plate=${encodeURIComponent(plate)}&slot_key=${encodeURIComponent(slotKey)}`,
      { method: "DELETE" },
    ).catch(() => {});
    const updated = customSlots.filter((c) => c.slot_key !== slotKey);
    setCustomSlots(updated);
    setUrls((u) => {
      const n = { ...u };
      delete n[slotKey];
      return n;
    });
    // '없음' 체크에 남아 있으면 함께 정리
    const nextNa = naSlots.filter((k) => k !== slotKey);
    const nextCheckNa = checkNaSlots.filter((k) => k !== slotKey);
    setNaSlots(nextNa);
    setCheckNaSlots(nextCheckNa);
    saveRecord({ custom_slots: updated, na_slots: nextNa, check_na_slots: nextCheckNa });
  }

  const handleUploaded = useCallback(
    (slotKey: string, url: string) => {
      setUrls((u) => ({ ...u, [slotKey]: url }));
      showToast("사진이 저장되었습니다");
    },
    [showToast],
  );
  const handleDeleted = useCallback(
    (slotKey: string) => {
      setUrls((u) => {
        const n = { ...u };
        delete n[slotKey];
        return n;
      });
      showToast("사진이 삭제되었습니다");
    },
    [showToast],
  );
  const handleSlotError = useCallback(
    (msg: string) => showToast(msg, "error"),
    [showToast],
  );

  return (
    <main className="mx-auto max-w-3xl px-3 pb-24 pt-4">
      {/* 완료/실패 토스트 팝업 */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 no-print">
          <div
            className={`rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg ${
              toast.type === "success" ? "bg-green-600" : "bg-red-600"
            }`}
          >
            {toast.type === "success" ? "✓ " : "⚠ "}
            {toast.msg}
          </div>
        </div>
      )}

      {/* 저장 완료 팝업 */}
      {savedPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 no-print">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl">
            <div className="text-4xl">✅</div>
            <p className="mt-2 text-lg font-bold text-gray-800">저장되었습니다</p>
            <p className="mt-1 text-xs text-gray-500">
              {plate} · 목록에서 확인·다운로드할 수 있습니다.
            </p>
            <button
              onClick={() => router.push("/list")}
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white active:bg-blue-700"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 중간 저장 완료 팝업 — 이어서 촬영 안내 */}
      {midSavedPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 no-print">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl">
            <div className="text-4xl">✅</div>
            <p className="mt-2 text-lg font-bold text-gray-800">
              여기까지 저장되었습니다
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {plate} · 나중에 차량번호로 다시 들어오면 촬영 안 한 페이지부터
              이어서 촬영할 수 있습니다.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setMidSavedPopup(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 active:bg-gray-100"
              >
                계속 촬영
              </button>
              <button
                onClick={() => router.push("/list")}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white active:bg-blue-700"
              >
                목록으로
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상단 바 */}
      <div className="mb-3 flex items-center justify-between">
        <Link href="/" className="text-sm text-blue-600">
          ← 차량 변경
        </Link>
        <span className="text-xs text-gray-400">
          {saveState === "saving" && "저장 중…"}
          {saveState === "saved" && "저장됨 ✓"}
          {saveState === "error" && <span className="text-red-500">저장 실패</span>}
        </span>
      </div>

      {/* 단계 표시 */}
      <ol className="mb-3 flex items-center justify-center gap-1 text-xs">
        {STEPS.map((title, i) => (
          <li key={title} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300">›</span>}
            <span
              className={`rounded-full px-2.5 py-1 font-medium ${
                i === step
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {i + 1}. {title}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        /* ── 1단계: 차량 정보 + 차량 이상유무 확인 ── */
        <>
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            {/* 타이틀 위 수정 버튼 */}
            <div className="mb-1 flex justify-end">
              <button
                onClick={toggleEditInfo}
                className={`rounded-md px-3 py-1 text-xs font-medium ${
                  editInfo
                    ? "bg-blue-600 text-white active:bg-blue-700"
                    : "border border-gray-300 text-gray-600 active:bg-gray-100"
                }`}
              >
                {editInfo ? "완료" : "수정"}
              </button>
            </div>
            <h1 className="mb-3 text-center text-lg font-bold text-blue-700">
              B820 설치 사진
            </h1>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <Field label="설치일자" value={installDate} />
              <Field label="차량NO" value={plate} />
              {editInfo ? (
                <EditField
                  label="운수사"
                  value={operator}
                  placeholder="운수사"
                  onChange={setOperator}
                  onBlur={() => saveRecord()}
                />
              ) : (
                <Field label="운수사" value={operator} />
              )}
              {editInfo ? (
                <EditField
                  label="노선"
                  value={route}
                  placeholder="노선"
                  onChange={setRoute}
                  onBlur={() => saveRecord()}
                />
              ) : (
                <Field label="노선" value={route} />
              )}
              <EditField
                label="연식"
                value={year}
                placeholder="예: 2021"
                onChange={setYear}
                onBlur={() => saveRecord()}
              />
              <EditField
                label="차종"
                value={model}
                placeholder="예: 일렉시티"
                onChange={setModel}
                onBlur={() => saveRecord()}
              />
              <label className="col-span-2 flex flex-col">
                <span className="text-xs text-gray-400">
                  팀명 <span className="text-red-500">*</span>
                  {teamLocked && (
                    <span className="ml-1 text-gray-400">(변경은 관리자만)</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  {teamOptions.length > 0 ? (
                    <select
                      value={team}
                      disabled={teamLocked}
                      onChange={(e) => changeTeam(e.target.value)}
                      className={`min-w-0 flex-1 rounded border px-2 py-1.5 outline-none focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 ${
                        team.trim() ? "border-gray-300 bg-white" : "border-red-300 bg-red-50"
                      }`}
                    >
                      <option value="">팀 선택</option>
                      {teamOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                      {team.trim() && !teamOptions.includes(team) && (
                        <option value={team}>{team}</option>
                      )}
                    </select>
                  ) : (
                    <input
                      value={team}
                      disabled={teamLocked}
                      placeholder="설치 팀명 (필수)"
                      onChange={(e) => setTeam(e.target.value)}
                      onBlur={() => changeTeam(team)}
                      className={`min-w-0 flex-1 rounded border px-2 py-1 outline-none focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 ${
                        team.trim() ? "border-gray-300" : "border-red-300 bg-red-50"
                      }`}
                    />
                  )}
                  {teamLocked && (
                    <button
                      type="button"
                      onClick={unlockTeam}
                      className="shrink-0 rounded border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 active:bg-gray-100"
                    >
                      변경
                    </button>
                  )}
                </div>
                {!team.trim() && (
                  <span className="mt-0.5 text-[11px] text-red-500">
                    {teamOptions.length > 0
                      ? "팀을 선택해야 저장할 수 있습니다."
                      : "팀명을 입력해야 저장할 수 있습니다."}
                  </span>
                )}
              </label>
            </div>
          </section>

          {/* 차량 이상유무 확인 (작업 시작 전 8종 + 추가 항목 — 사진은 드라이브 보관용, PDF/엑셀 미포함) */}
          <SectionHeader title="차량 이상유무 확인" />
          <p className="mb-2 -mt-1 text-[11px] text-gray-500">
            작업 시작 전 촬영 · 장비가 없는 항목은 &lsquo;없음&rsquo;에 체크해주세요.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {checkSlots.map((slot, i) => (
              <PhotoSlot
                key={slot.slotKey}
                plate={plate}
                slot={slot}
                sortOrder={i}
                initialUrl={urls[slot.slotKey] ?? null}
                onUploaded={handleUploaded}
                onDeleted={handleDeleted}
                onError={handleSlotError}
                onRemoveSlot={removeCustomSlot}
                allowNoTerminal
                naLabel="없음"
                noTerminal={checkNaSlots.includes(slot.slotKey)}
                onToggleNoTerminal={toggleCheckNa}
              />
            ))}
            <button
              onClick={() => addCustomSlot("check")}
              className="flex aspect-[3/2] min-h-[120px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-blue-300 text-blue-500 active:bg-blue-50"
            >
              <span className="text-2xl">+</span>
              <span className="text-xs">항목 추가</span>
            </button>
          </div>
          <label className="mt-2 flex flex-col">
            <span className="text-xs text-gray-500">
              비고 (차량 이상유무) <span className="text-red-500">*</span>
            </span>
            <textarea
              value={checkNote}
              placeholder="차량 이상 내용을 적어주세요 (예: 전광판 화면 깨짐 · 이상 없으면 '없음')"
              onChange={(e) => setCheckNote(e.target.value)}
              onBlur={() => saveRecord()}
              rows={2}
              className={`mt-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 ${
                checkNote.trim() ? "border-gray-300 bg-white" : "border-red-300 bg-red-50"
              }`}
            />
            {!checkNote.trim() && (
              <span className="mt-0.5 text-[11px] text-red-500">
                필수 입력 — 이상이 없으면 &lsquo;없음&rsquo;이라고 적어주세요.
              </span>
            )}
          </label>
        </>
      ) : (
        /* ── 2·3단계 공통: 차량 요약 ── */
        <section className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="font-bold text-blue-700">{plate}</span>
            <span className="text-gray-500">{operator}</span>
            <span className="text-gray-500">{route}</span>
            {team.trim() && <span className="text-gray-500">{team}</span>}
          </div>
        </section>
      )}

      {step === 1 && (
        /* ── 2단계: 설치 전 ── */
        <>
          <SectionHeader title="설치 전" />
          {/* 폐차 후 증차차량 — 설치전 사진이 없어 칸 전체를 사진 없이 충족 처리 */}
          <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
            <input
              type="checkbox"
              checked={addedVehicle}
              onChange={(e) => toggleAddedVehicle(e.target.checked)}
              className="h-4 w-4 accent-amber-600"
            />
            <span className="text-sm font-medium text-amber-800">
              증차차량 (폐차 후 증차 — 설치 전 사진 없음)
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {beforeSlots.map((slot, i) => (
              <PhotoSlot
                key={slot.slotKey}
                plate={plate}
                slot={slot}
                sortOrder={i}
                initialUrl={urls[slot.slotKey] ?? null}
                onUploaded={handleUploaded}
                onDeleted={handleDeleted}
                onError={handleSlotError}
                onRemoveSlot={removeCustomSlot}
                allowNoTerminal={slot.slotKey.includes("alight")}
                noTerminal={naSlots.includes(slot.slotKey)}
                onToggleNoTerminal={toggleNoTerminal}
                naLabel={addedVehicle ? "증차차량" : "단말기 없음"}
              />
            ))}
            <button
              onClick={() => addCustomSlot("before")}
              className="flex aspect-[3/2] min-h-[120px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-blue-300 text-blue-500 active:bg-blue-50"
            >
              <span className="text-2xl">+</span>
              <span className="text-xs">항목 추가</span>
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        /* ── 3단계: 설치 후 + 특이사항 + 저장 ── */
        <>
          <SectionHeader title="설치 후" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {AFTER_SLOTS.map((slot, i) => (
              <PhotoSlot
                key={slot.slotKey}
                plate={plate}
                slot={slot}
                sortOrder={i}
                initialUrl={urls[slot.slotKey] ?? null}
                onUploaded={handleUploaded}
                onDeleted={handleDeleted}
                onError={handleSlotError}
                allowNoTerminal={slot.slotKey.includes("alight")}
                noTerminal={naSlots.includes(slot.slotKey)}
                onToggleNoTerminal={toggleNoTerminal}
              />
            ))}
          </div>

          <SectionHeader title="특이사항 *" />
          <textarea
            value={extraNote}
            placeholder="설치 중 특이사항을 적어주세요 (없으면 '없음')"
            onChange={(e) => setExtraNote(e.target.value)}
            onBlur={() => saveRecord()}
            rows={3}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 ${
              extraNote.trim() ? "border-gray-300 bg-white" : "border-red-300 bg-red-50"
            }`}
          />
          {!extraNote.trim() && (
            <p className="mt-0.5 text-[11px] text-red-500">
              필수 입력 — 특이사항이 없으면 &lsquo;없음&rsquo;이라고 적어주세요.
            </p>
          )}
        </>
      )}

      {/* 하단 이동/저장 바 */}
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-3 backdrop-blur no-print">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {step === 0 ? (
            <Link
              href="/list"
              className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 active:bg-gray-100"
            >
              목록
            </Link>
          ) : (
            <button
              onClick={() => setStep(step - 1)}
              className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 active:bg-gray-100"
            >
              ← 이전
            </button>
          )}
          {step < 2 && (
            <button
              onClick={handleMidSave}
              disabled={submitting}
              className="flex-1 rounded-lg border border-blue-600 bg-white px-4 py-3 text-sm font-semibold text-blue-600 active:bg-blue-50 disabled:opacity-50"
            >
              {submitting ? "저장 중…" : "저장"}
            </button>
          )}
          {step === 0 && (
            <button
              onClick={goNextFromCheck}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white active:bg-blue-700"
            >
              다음 (설치 전) →
            </button>
          )}
          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white active:bg-blue-700"
            >
              다음 (설치 후) →
            </button>
          )}
          {step === 2 && (
            <button
              onClick={handleSave}
              disabled={submitting}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "저장 중…" : "저장"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function EditField({
  label,
  value,
  placeholder,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <label className="flex flex-col">
      <span className="text-xs text-gray-400">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="rounded border border-gray-300 px-2 py-1 outline-none focus:border-blue-500"
      />
    </label>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-2 mt-5 rounded-md bg-gray-700 px-3 py-1.5 text-sm font-semibold text-white">
      {title}
    </h2>
  );
}
