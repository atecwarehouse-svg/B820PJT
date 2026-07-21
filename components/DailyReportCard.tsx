"use client";

import { useEffect, useMemo, useState } from "react";
import type { CompletedVehicle, ScheduleDay } from "@/lib/stats";
import { buildReport, formatReportText } from "@/lib/report";
import type { ServiceCheck } from "@/lib/report";
import type { VocOperatorSummary } from "@/lib/voc";

type Status = "" | "ok" | "issue";

// 체크박스 한 줄 (승무사원 교육·요금세팅)
function ChkRow({
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
    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-gray-800">{label}</span>
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
    <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-2">
      <p className="text-xs font-medium text-gray-800">{label}</p>
      {desc && <p className="mt-0.5 text-[11px] text-gray-500">{desc}</p>}
      <div className="mt-1.5 flex gap-2">
        <button
          type="button"
          onClick={() => onStatus("ok")}
          className={`flex-1 rounded-lg border px-2 py-1 text-xs font-semibold ${
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
          className={`flex-1 rounded-lg border px-2 py-1 text-xs font-semibold ${
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

// 금일 설치 완료 리포트 카드 — 미리보기 + Gmail 발송.
export default function DailyReportCard({
  completedList,
  scheduleDays,
  cumDone,
  cumPlanned,
  today,
  inProgress = 0,
  stage = 2,
  onSent,
}: {
  completedList: CompletedVehicle[];
  scheduleDays: ScheduleDay[];
  cumDone: number;
  cumPlanned: number;
  today: string;
  inProgress?: number; // 진행중(미완료) 차량 수 — 발송 전 경고용
  stage?: 1 | 2; // 1차=팀즈 알림만, 2차=VOC 포함 + 메일 발송
  onSent?: (recipients: string[], teamsSent?: boolean) => void; // 발송 성공 시 부모가 완료 팝업 표시 (팀즈 카드 전송 여부 포함)
}) {
  const [date, setDate] = useState(today);
  const [planned, setPlanned] = useState(""); // 금일 계획 수량 직접 입력
  const [notes, setNotes] = useState("");
  // 운행시작 점검 (특이사항 위에 표기)
  const [driverEdu, setDriverEdu] = useState(false);
  const [fareSetting, setFareSetting] = useState(false);
  const [baseFare, setBaseFare] = useState("");
  const [bisStatus, setBisStatus] = useState<Status>("");
  const [bisSymptom, setBisSymptom] = useState("");
  const [kakaoStatus, setKakaoStatus] = useState<Status>("");
  const [kakaoSymptom, setKakaoSymptom] = useState("");
  const [to, setTo] = useState("");
  const [pw, setPw] = useState(""); // 관리자 비밀번호
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false); // 이중발송 방지
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [vocs, setVocs] = useState<VocOperatorSummary[]>([]);
  const [prefilled, setPrefilled] = useState(false); // 1차 발송 내용을 불러왔는지

  // 2차 폼 프리필 — 같은 날짜로 1차를 발송했으면 그때의 특이사항·운행시작 점검·계획수량을
  // 자동으로 채운다. 이미 입력된 칸은 덮지 않는다(늦게 도착한 응답이 입력을 지우는 사고 방지).
  useEffect(() => {
    if (stage !== 2) return;
    setPrefilled(false);
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/report/send?date=${encodeURIComponent(date)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        const d = json.draft;
        if (!alive || !d) return;
        if (typeof d.notes === "string" && d.notes) {
          setNotes((cur) => (cur === "" ? d.notes : cur));
        }
        if (typeof d.planned === "number") setPlanned(String(d.planned));
        const c = (d.check ?? {}) as Partial<ServiceCheck>;
        if (c.driverEdu) setDriverEdu(true);
        if (c.fareSetting) setFareSetting(true);
        if (typeof c.baseFare === "string" && c.baseFare) {
          setBaseFare((cur) => (cur === "" ? (c.baseFare as string) : cur));
        }
        if (c.bisStatus === "ok" || c.bisStatus === "issue") {
          setBisStatus((cur) => (cur === "" ? (c.bisStatus as Status) : cur));
        }
        if (typeof c.bisSymptom === "string" && c.bisSymptom) {
          setBisSymptom((cur) => (cur === "" ? (c.bisSymptom as string) : cur));
        }
        if (c.kakaoStatus === "ok" || c.kakaoStatus === "issue") {
          setKakaoStatus((cur) => (cur === "" ? (c.kakaoStatus as Status) : cur));
        }
        if (typeof c.kakaoSymptom === "string" && c.kakaoSymptom) {
          setKakaoSymptom((cur) => (cur === "" ? (c.kakaoSymptom as string) : cur));
        }
        setPrefilled(true);
      } catch {
        // 불러오기 실패 — 새로 입력하면 된다
      }
    })();
    return () => {
      alive = false;
    };
  }, [stage, date]);

  // 2차 미리보기용 VOC 요약 — 선택한 날짜가 바뀌면 다시 불러온다.
  // (발송 시에는 서버가 같은 날짜로 다시 조회하므로 여기 실패해도 내용은 빠지지 않는다.)
  useEffect(() => {
    if (stage !== 2) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/voc/summary?date=${encodeURIComponent(date)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (alive) setVocs((json.list ?? []) as VocOperatorSummary[]);
      } catch {
        if (alive) setVocs([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [stage, date]);

  // 입력값(숫자) 있으면 override, 없으면 null → 예정일 기준 자동 계산
  const plannedOverride =
    planned.trim() !== "" && !isNaN(Number(planned)) ? Number(planned) : null;

  // 날짜가 바뀌면 그 날짜의 예정 수량으로 계획 입력칸 자동 채움(이후 수정 가능)
  useEffect(() => {
    const sd = scheduleDays.find((d) => d.date === date)?.planned ?? 0;
    setPlanned(String(sd));
  }, [date, scheduleDays]);

  const check: ServiceCheck = useMemo(
    () => ({
      driverEdu,
      fareSetting,
      baseFare,
      bisStatus,
      bisSymptom,
      kakaoStatus,
      kakaoSymptom,
    }),
    [driverEdu, fareSetting, baseFare, bisStatus, bisSymptom, kakaoStatus, kakaoSymptom],
  );

  // 내용을 바꾸면 다시 발송 가능
  useEffect(() => {
    setSent(false);
  }, [date, notes, to, planned, check]);

  const report = useMemo(
    () => buildReport({ date, completedList, scheduleDays, cumDone, cumPlanned, plannedOverride }),
    [date, completedList, scheduleDays, cumDone, cumPlanned, plannedOverride],
  );
  const text = useMemo(
    () => formatReportText(report, notes, check, stage === 2 ? vocs : undefined),
    [report, notes, check, stage, vocs],
  );

  async function send() {
    if (sending || sent || !pw) return; // 이중발송 방지 + 비밀번호 필수
    if (bisStatus === "issue" && !bisSymptom.trim()) {
      setMsg({ ok: false, text: "BIS 이상 증상을 입력하세요." });
      return;
    }
    if (kakaoStatus === "issue" && !kakaoSymptom.trim()) {
      setMsg({ ok: false, text: "카카오(초정밀) 이상 증상을 입력하세요." });
      return;
    }
    const warn = inProgress > 0 ? `⚠️ 미완료(진행중) 차량이 ${inProgress}대 있습니다.\n\n` : "";
    const what = stage === 1 ? "팀즈 카드만 전송" : "메일 발송 + 팀즈 카드 전송";
    if (!window.confirm(`${warn}[${stage}차] 이 내용으로 ${what}할까요?`)) return;
    setSending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/report/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, notes, to, planned: plannedOverride, pw, check, stage }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "발송 실패");
      setSent(true);
      onSent?.(j.to ?? [], j.teams === true);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "발송 실패" });
    } finally {
      setSending(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ ok: true, text: "복사되었습니다." });
    } catch {
      setMsg({ ok: false, text: "복사 실패" });
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setDate(today)}
          className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
        >
          오늘
        </button>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">계획</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
            placeholder="수량"
            className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
          <span className="text-xs text-gray-500">대</span>
        </div>
      </div>

      {prefilled && (
        <p className="mt-2 rounded-lg bg-blue-50 px-3 py-1.5 text-[11px] font-medium text-blue-600">
          1차 보고 내용(특이사항·운행시작 점검·계획수량)을 불러왔습니다 — 수정 후 발송하세요
        </p>
      )}

      {/* 카드 미리보기 */}
      <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-gray-200 bg-gray-50 p-3 text-[13px] leading-relaxed text-gray-800">
        {text}
      </pre>

      {/* 운행시작 점검 (특이사항 위) */}
      <div className="mt-3 space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
        <p className="text-xs font-semibold text-gray-700">운행시작 점검</p>
        <ChkRow
          checked={driverEdu}
          onChange={setDriverEdu}
          label="첫차 운행시작 · 승무사원 교육 완료"
        />
        <ChkRow
          checked={fareSetting}
          onChange={setFareSetting}
          label="단말기 요금세팅 확인"
          desc="다인승 조작으로 기본요금 확인"
        />
        <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-2">
          <label className="block text-[11px] font-medium text-gray-500">기본요금 (원)</label>
          <input
            type="text"
            inputMode="numeric"
            value={baseFare}
            onChange={(e) => setBaseFare(e.target.value)}
            placeholder="예: 1500"
            className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            버스 문에 붙어있는 요금과 동일한지 확인
          </p>
        </div>
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
          desc="카카오 초정밀버스 이상 유무"
          status={kakaoStatus}
          onStatus={setKakaoStatus}
          symptom={kakaoSymptom}
          onSymptom={setKakaoSymptom}
        />
      </div>

      {/* 특이사항 */}
      <label className="mt-3 block text-xs font-medium text-gray-600">특이사항 (선택)</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder={"예) 영신여객 5대 배차시간 부족으로 미설치, 금일 설치예정"}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />

      {/* 받는사람 — 메일을 보내는 2차에서만 */}
      {stage === 2 && (
        <>
          <label className="mt-2 block text-xs font-medium text-gray-600">
            받는사람 (쉼표로 여러 명 · 비우면 관리자 페이지의 기본 수신자)
          </label>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="name@example.com, name2@example.com"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </>
      )}

      {/* 관리자 비밀번호 (발송 필수) */}
      <label className="mt-2 block text-xs font-medium text-gray-600">관리자 비밀번호</label>
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="비밀번호 입력"
        autoComplete="off"
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />

      {inProgress > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          ⚠️ 미완료(진행중) 차량이 {inProgress}대 있습니다. 발송 전 확인하세요.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={copy}
          className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          복사
        </button>
        <button
          onClick={send}
          disabled={sending || sent || !pw}
          className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {sending
            ? "발송 중…"
            : sent
              ? "발송됨 ✓"
              : stage === 1
                ? "팀즈 전송 (1차)"
                : "메일 발송 + 팀즈 전송 (2차)"}
        </button>
      </div>
      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      )}
    </div>
  );
}
