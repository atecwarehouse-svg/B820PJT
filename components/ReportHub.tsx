"use client";

import Icon from "@/components/Icon";
import { useEffect, useRef, useState } from "react";
import { workDateString } from "@/lib/work-day";
import { DEFAULT_REPORT_LABEL, planSheet, startSheet, type Sheet } from "@/lib/report-sheet";
import { saveSheetImage, sheetFileName } from "@/lib/report-image";

// ── 공통 유틸 ───────────────────────────────────────────────
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
function fmtLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
  return `${m}/${d} (${dow})`;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

interface PlanGroup {
  operator: string;
  route: string;
  planned: number;
}

// '보고용 이미지' 버튼 — 팀즈 카드와 같은 모양(Sheet)을 PNG로 저장(팀즈에서 다시 캡쳐하지 않게).
// 발송 전·후 언제든 받을 수 있다. make()는 누른 순간의 입력값으로 보고서를 만든다.
function SheetImageButton({
  make,
  fileName,
  className = "",
}: {
  make: () => Sheet;
  fileName: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function save() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      if (!(await saveSheetImage(make(), fileName))) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={save}
      disabled={busy}
      className={`rounded-lg bg-gray-100 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 ${className}`}
    >
      {busy ? "만드는 중…" : failed ? "이미지 실패 — 다시" : "보고용 이미지"}
    </button>
  );
}

// 완료 안내 화면 (전송 성공 후) — btnClass는 Tailwind가 스캔할 수 있게 전체 클래스로 전달.
// image가 있으면 방금 보낸 내용의 보고용 이미지 저장 버튼을 함께 보여준다.
function DonePanel({
  title,
  sub,
  onClose,
  btnClass,
  image,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  btnClass: string;
  image?: { make: () => Sheet; fileName: string };
}) {
  return (
    <div className="py-6 text-center">
      <p className="text-3xl"><Icon name="done" /></p>
      <p className="mt-2 text-sm font-semibold text-gray-700">{title}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
      {image && (
        <>
          <p className="mt-4 text-xs font-medium text-gray-600">보고용 이미지도 저장할까요?</p>
          <SheetImageButton {...image} className="mt-2 w-full font-semibold" />
        </>
      )}
      <button
        type="button"
        onClick={onClose}
        className={`mt-4 w-full rounded-xl py-3 text-sm font-bold text-white ${btnClass}`}
      >
        확인
      </button>
    </div>
  );
}

// ── 1) 설치계획 보고 패널 ────────────────────────────────────
interface EntryState {
  hour: string;
  minute: string;
  place: string;
  dayOff: string;
  nextDayOff: string;
  notes: string; // 특이사항 — 협의사항 저장분 프리필, 수정 가능, 두 카드에 반영
}

function PlanReportPanel({
  today,
  planGroups,
  projectLabel,
  onClose,
}: {
  today: string;
  planGroups: PlanGroup[];
  projectLabel: string; // 보고용 이미지 머리말
  onClose: () => void;
}) {
  const INPUT =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";
  const LABEL = "text-[11px] font-medium text-gray-500";
  const label = fmtLabel(today);

  const operators = (() => {
    const m = new Map<string, { routes: { route: string; count: number }[]; count: number }>();
    for (const g of planGroups) {
      const o = m.get(g.operator) ?? { routes: [], count: 0 };
      if (g.route) o.routes.push({ route: g.route, count: g.planned }); // 수량 차감 방식은 노선 없이 운수사 대수만
      o.count += g.planned;
      m.set(g.operator, o);
    }
    return [...m.entries()].map(([operator, v]) => ({ operator, ...v }));
  })();
  const total = operators.reduce((s, o) => s + o.count, 0);

  const [step, setStep] = useState<"form" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, EntryState>>({});
  // 아직 전송 안 된 채팅방 — 한 방만 실패하면 재시도는 그 방에만 보낸다(중복 발송 방지)
  const [pendingRooms, setPendingRooms] = useState<("start" | "consult")[]>([
    "start",
    "consult",
  ]);

  // 열릴 때 협의사항(설치장소·휴차)으로 프리필
  useEffect(() => {
    let alive = true;
    (async () => {
      const init: Record<string, EntryState> = {};
      for (const o of operators) {
        init[o.operator] = {
          hour: "",
          minute: "00",
          place: "",
          dayOff: "",
          nextDayOff: "",
          notes: "",
        };
      }
      try {
        const res = await fetch(`/api/consultation?date=${today}`, { cache: "no-store" });
        const json = await res.json();
        for (const c of (json.list ?? []) as {
          operator: string;
          place: string | null;
          day_off: string | null;
          next_day_off: string | null;
          notes: string | null;
        }[]) {
          if (init[c.operator]) {
            init[c.operator].place = c.place ?? "";
            init[c.operator].dayOff = c.day_off ?? "";
            init[c.operator].nextDayOff = c.next_day_off ?? "";
            init[c.operator].notes = c.notes ?? "";
          }
        }
      } catch {
        // 실패 시 빈 값
      }
      // 오늘 이미 보고했으면 그때 입력값 그대로(협의사항 프리필보다 우선) — 날짜가 바뀌면 저장값이 없어 빈 칸
      try {
        const res = await fetch(`/api/plan-report?date=${today}`, { cache: "no-store" });
        const saved = ((await res.json()).input ?? {}) as Record<
          string,
          { time?: string; place?: string; dayOff?: string; nextDayOff?: string; notes?: string }
        >;
        for (const [op, v] of Object.entries(saved)) {
          if (!init[op] || !v || typeof v !== "object") continue;
          const [hour = "", minute = "00"] = (v.time ?? "").split(":");
          init[op] = {
            hour,
            minute: hour ? minute : "00",
            place: v.place ?? "",
            dayOff: v.dayOff ?? "",
            nextDayOff: v.nextDayOff ?? "",
            notes: v.notes ?? "",
          };
        }
      } catch {
        // 없으면 협의사항 프리필만
      }
      // 응답이 오는 사이 사용자가 입력한 값은 프리필로 덮지 않는다
      if (alive) {
        setEntries((cur) => {
          const merged: Record<string, EntryState> = { ...init };
          for (const [op, v] of Object.entries(cur)) {
            merged[op] = { ...(init[op] ?? {}), ...v };
          }
          return merged;
        });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  function update(operator: string, patch: Partial<EntryState>) {
    setEntries((e) => ({ ...e, [operator]: { ...e[operator], ...patch } }));
  }

  // 입력값 → 운수사별 계획 — 팀즈 전송과 보고용 이미지가 같은 값을 쓴다
  function buildGroups() {
    return operators.map((o) => {
      const e = entries[o.operator];
      return {
        operator: o.operator,
        routes: o.routes,
        count: o.count,
        time: e?.hour ? `${e.hour}:${e.minute || "00"}` : "",
        place: e?.place ?? "",
        dayOff: e?.dayOff ?? "",
        nextDayOff: e?.nextDayOff ?? "",
        notes: e?.notes ?? "",
      };
    });
  }
  // 보고용 이미지 = 시작보고방 카드(설치계획 보고)와 같은 내용
  const image = {
    make: () => planSheet({ label, total, groups: buildGroups() }, "start", projectLabel),
    fileName: sheetFileName(projectLabel, "설치계획보고", today),
  };

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      const groups = buildGroups();
      const res = await fetch("/api/plan-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, date: today, groups, rooms: pendingRooms }),
      });
      const json = await res.json();
      if (!res.ok) {
        // 일부 방만 성공했으면 남은 방만 재시도 대상으로 남긴다
        if (Array.isArray(json.sent) && json.sent.length > 0) {
          setPendingRooms((prev) => prev.filter((r) => !json.sent.includes(r)));
        }
        throw new Error(json.error ?? "전송 실패");
      }
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setBusy(false);
    }
  }

  if (step === "done") {
    return (
      <DonePanel
        title="두 채팅방(시작보고·협의사항)으로 전송했습니다"
        sub={`${label} 설치계획 ${total.toLocaleString()}대`}
        onClose={onClose}
        btnClass="bg-teal-600 active:bg-teal-700"
        image={image}
      />
    );
  }

  if (operators.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        오늘({label}) 설치 계획이 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-teal-50 px-3 py-2 text-center text-sm font-bold text-teal-700">
        {label} 설치계획 {total.toLocaleString()}대
      </p>
      <p className="text-[11px] text-gray-400">
        설치 장소·휴차는 운수사 협의사항에 저장된 내용이 자동으로 채워집니다(수정 가능).
        시작보고방 카드에는 휴차가 빠지고, 협의사항방 카드에는 협의사항의
        도착시간·협조확인·단말기 설치위치·특이사항이 함께 표시됩니다.
      </p>

      {operators.map((o) => {
        const e = entries[o.operator] ?? {
          hour: "",
          minute: "00",
          place: "",
          dayOff: "",
          nextDayOff: "",
          notes: "",
        };
        return (
          <div key={o.operator} className="space-y-2 rounded-xl border border-gray-200 p-3">
            <p className="text-sm font-bold text-gray-800">
              {o.operator} <span className="font-normal text-gray-400">{o.count}대</span>
            </p>
            {o.routes.length > 0 && (
              <p className="text-xs text-gray-500">
                {o.routes.map((r) => `${r.route} ${r.count}대`).join(" · ")}
              </p>
            )}

            <div>
              <span className={LABEL}>집합시간 (24시간)</span>
              <div className="mt-1 flex items-center gap-1.5">
                <select
                  value={e.hour}
                  onChange={(ev) => update(o.operator, { hour: ev.target.value })}
                  className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-teal-500 focus:outline-none"
                >
                  <option value="">--</option>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-gray-500">시</span>
                <select
                  value={e.hour ? e.minute : ""}
                  disabled={!e.hour}
                  onChange={(ev) => update(o.operator, { minute: ev.target.value })}
                  className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-teal-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                >
                  {!e.hour && <option value="">--</option>}
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-gray-500">분</span>
              </div>
            </div>

            <label className="block">
              <span className={LABEL}>설치 장소</span>
              <input
                type="text"
                value={e.place}
                onChange={(ev) => update(o.operator, { place: ev.target.value })}
                placeholder="주소 입력"
                className={INPUT}
              />
            </label>

            <label className="block">
              <span className={LABEL}>당일 휴차</span>
              <input
                type="text"
                value={e.dayOff}
                onChange={(ev) => update(o.operator, { dayOff: ev.target.value })}
                placeholder="차량번호 입력"
                className={INPUT}
              />
            </label>

            <label className="block">
              <span className={LABEL}>익일 휴차</span>
              <input
                type="text"
                value={e.nextDayOff}
                onChange={(ev) => update(o.operator, { nextDayOff: ev.target.value })}
                placeholder="차량번호 입력"
                className={INPUT}
              />
            </label>

            <label className="block">
              <span className={LABEL}>특이사항</span>
              <textarea
                value={e.notes}
                onChange={(ev) => update(o.operator, { notes: ev.target.value })}
                placeholder="예) 첫차 이후 순차 입고, 차고지 협소 주의 등 (없으면 비워두세요)"
                rows={2}
                className={`${INPUT} resize-none`}
              />
            </label>
          </div>
        );
      })}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <SheetImageButton {...image} className="shrink-0 rounded-xl py-3" />
        <button
          type="button"
          onClick={handleSend}
          disabled={busy}
          className="flex-1 rounded-xl bg-teal-600 py-3 text-sm font-bold text-white active:bg-teal-700 disabled:opacity-50"
        >
          {busy ? "전송 중..." : "두 채팅방으로 보내기"}
        </button>
      </div>
    </div>
  );
}

// ── 2)·4) 설치시작 보고 / 진행중 공유 패널 (숫자 카드 공유) ──────
function ShareStatPanel({
  kind,
  today,
  todayPlanned,
  todayDone,
  complete,
  inProgress,
  remain,
  planGroups,
  inspectorList,
  teamList = [],
  brand = "B820",
  projectLabel = DEFAULT_REPORT_LABEL,
  onClose,
}: {
  kind: "start" | "progress";
  today: string;
  todayPlanned: number;
  todayDone: number;
  complete: number;
  inProgress: number;
  remain: number;
  planGroups: PlanGroup[];
  inspectorList: string[]; // 등록된 검수자 이름 — 설치팀별 담당 선택지
  teamList?: string[]; // 등록된 설치팀 라벨("팀명 이름") — 팀별 담당 검수자 지정 대상
  brand?: string;
  projectLabel?: string; // 보고용 이미지 머리말
  onClose: () => void;
}) {
  const label = fmtLabel(today);
  const isStart = kind === "start";
  // 마지막으로 보고한 내용 — 보고하면 선택이 비워지므로, 보고 직후 이미지는 이 값으로 만든다
  const [lastSent, setLastSent] = useState<{ groups: PlanGroup[]; startTime: string; note: string; revised: boolean } | null>(null);
  // 수정·재보고 모드 — 이미 보고한 운수사를 골라 특이사항(·시작시간)을 고쳐 (수정) 카드로 다시 보낸다
  const [editMode, setEditMode] = useState(false);
  const [meta, setMeta] = useState<Record<string, { note: string; startTime: string }>>({}); // 운수사별 마지막 보고 내용
  const [startDone, setStartDone] = useState(false); // 설치시작 보고 직후 완료 화면(이미지 저장 여부 묻기)
  const [sharing, setSharing] = useState(false);
  const [sent, setSent] = useState(false); // 전송 성공 — 버튼을 잠가 중복 카드 방지
  const [note, setNote] = useState(""); // 설치시작 보고 특이사항 — 카드에 함께 표시
  const [startTime, setStartTime] = useState(() => new Date().toTimeString().slice(0, 5)); // 설치 시작시간 (기기 시각 기본)
  // 설치팀별 담당 검수자(복수 가능) — 설치시작·완료 알림을 담당자 개인방으로 보내는 기준(라우팅 전용, 카드엔 안 나감).
  // 누르면 즉시 저장되고 보고와는 무관하다(보고 전·후 언제든 변경 가능).
  const [teamMgr, setTeamMgr] = useState<Record<string, string[]>>({});
  // 저장 중인 팀 — 한 칸짜리로 두면 A 저장 중에 B를 눌렀을 때 A가 다시 눌리고
  // 되돌리기 값이 어긋난다. 팀별로 잠근다.
  const [savingTeams, setSavingTeams] = useState<Set<string>>(new Set());
  const operators = isStart ? [...new Set(planGroups.map((g) => g.operator))] : [];
  // 운수사별 개별 발송 — 당일 보고 완료 운수사는 DB(app_settings) 기준으로 잠금 (전 기기 공유)
  const [sentOps, setSentOps] = useState<string[]>([]);
  const [loadingSent, setLoadingSent] = useState(isStart);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function loadSent(init: boolean) {
    try {
      const j = await (await fetch(`/api/teams/share?date=${today}`)).json();
      const ops: string[] = Array.isArray(j.sentOps) ? j.sentOps : [];
      setSentOps(ops);
      // 설치팀별 담당(그날 저장분) — 다른 기기에서 바꾼 것도 그대로 보여준다
      if (j.teamAssignments && typeof j.teamAssignments === "object") {
        setTeamMgr(j.teamAssignments as Record<string, string[]>);
      }
      if (j.meta && typeof j.meta === "object") setMeta(j.meta as Record<string, { note: string; startTime: string }>);
      if (init) {
        setSelected(new Set(operators.filter((op) => !ops.includes(op))));
      } else if (!editMode) {
        // 수정·재보고 중에는 고른 운수사가 원래 '보고 완료'라 걸러내면 안 된다
        setSelected((s) => new Set([...s].filter((op) => !ops.includes(op))));
      }
    } catch {
      if (init) setSelected(new Set(operators)); // 조회 실패 시 잠금 없이 진행 (서버가 중복을 최종 차단)
    }
  }

  // 처음 열 때 1회만 — 보고 완료 운수사·담당자를 불러온다(이후는 보고/저장 시 갱신).
  useEffect(() => {
    if (isStart) loadSent(true).finally(() => setLoadingSent(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 수정·재보고 들어가기 전 입력하던 특이사항·시작시간 — 취소·재보고 후 되돌린다(미보고 운수사용 입력 보존)
  const draftRef = useRef<{ note: string; startTime: string } | null>(null);
  const editSeq = useRef(0); // 불러오는 사이 취소·다른 운수사 수정으로 바뀌면 늦게 온 응답은 버린다
  // 수정·재보고 시작 — 그 운수사만 고르고, 그때 보낸 특이사항·시작시간을 칸에 다시 채운다.
  // 다른 기기에서 먼저 고쳤을 수 있으니 저장된 내용을 새로 불러와 쓴다(실패하면 가진 값으로).
  async function startEdit(op: string) {
    if (!editMode) draftRef.current = { note, startTime };
    setEditMode(true);
    setSelected(new Set([op]));
    setMsg(null);
    const seq = ++editSeq.current;
    let m = meta;
    try {
      const j = await (await fetch(`/api/teams/share?date=${today}`)).json();
      if (j.meta && typeof j.meta === "object") {
        m = j.meta as typeof meta;
        setMeta(m);
      }
    } catch {}
    if (seq !== editSeq.current) return;
    setNote(m[op]?.note ?? "");
    if (m[op]?.startTime) setStartTime(m[op].startTime);
  }
  function endEdit() {
    editSeq.current++;
    setEditMode(false);
    setNote(draftRef.current?.note ?? "");
    if (draftRef.current?.startTime) setStartTime(draftRef.current.startTime);
    draftRef.current = null;
  }
  function cancelEdit() {
    endEdit();
    setSelected(new Set(operators.filter((op) => !sentOps.includes(op))));
    setMsg(null);
  }
  // 저장된 보고 내용이 없는 운수사(이 기능 배포 전 보고 등) — 빈 칸·현재 시각으로 덮어쓰지 않게 경고
  const metaMissing = editMode ? [...selected].filter((op) => !meta[op]) : [];

  // 설치팀 담당 검수자 변경 — 즉시 저장. 팀즈 보고 카드와는 무관(다시 나가지 않는다).
  async function saveTeam(team: string, names: string[]) {
    if (savingTeams.has(team)) return;
    const prev = teamMgr[team] ?? [];
    setTeamMgr((m) => ({ ...m, [team]: names })); // 먼저 화면에 반영
    setSavingTeams((s) => new Set(s).add(team));
    setMsg(null);
    try {
      const res = await fetch("/api/teams/share", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, team, inspectors: names }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "담당 저장 실패");
      // 서버가 실제로 저장한 값으로 맞춘다 — 등록에 없는 이름은 서버가 걸러내므로
      // 화면만 반영해 두면 "저장됐다"고 보이는데 알림은 안 가는 상태가 된다.
      const saved = Array.isArray(j.inspectors) ? (j.inspectors as string[]) : names;
      setTeamMgr((m) => ({ ...m, [team]: saved }));
      setMsg({ ok: true, text: `${team} 담당 ${saved.length ? saved.join(", ") : "없음"}으로 저장했습니다.` });
    } catch (e) {
      setTeamMgr((m) => ({ ...m, [team]: prev })); // 실패하면 되돌림
      setMsg({ ok: false, text: e instanceof Error ? e.message : "담당 저장 실패" });
    } finally {
      setSavingTeams((s) => {
        const next = new Set(s);
        next.delete(team);
        return next;
      });
    }
  }

  const selGroups = planGroups.filter((g) => selected.has(g.operator));
  const selPlanned = selGroups.reduce((s, g) => s + g.planned, 0);
  const allSent = operators.length > 0 && operators.every((op) => sentOps.includes(op));

  async function share() {
    if (sharing || (isStart ? selected.size === 0 : sent)) return;
    // 화면을 오래 열어두면 서버가 그려준 업무일이 지금과 달라질 수 있다. 그대로 보고하면
    // 배정이 엉뚱한 날짜에 저장돼 알림이 담당자에게 안 가고, 잘못된 중복 경고까지 뜬다.
    if (isStart && today !== workDateString(new Date())) {
      setMsg({ ok: false, text: "업무일이 바뀌었습니다. 새로고침 후 다시 보고해 주세요." });
      return;
    }
    setSharing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/teams/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          label,
          todayPlanned: isStart ? selPlanned : todayPlanned,
          todayDone,
          complete,
          inProgress,
          remain,
          ...(isStart
            ? {
                groups: selGroups,
                note: note.trim(),
                startTime,
                date: today,
                resend: editMode, // 수정·재보고 — 서버가 '이미 보고한 운수사'인지 확인 후 (수정) 카드 발송
              }
            : {}),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "전송 실패");
      if (isStart) {
        setLastSent({ groups: selGroups, startTime, note: note.trim(), revised: editMode });
        setStartDone(true);
        // 보낸 내용 기억 — 이어서 수정·재보고를 누르면 이 값이 칸에 채워진다
        setMeta((m) => ({ ...m, ...Object.fromEntries([...selected].map((op) => [op, { note: note.trim(), startTime }])) }));
        setSentOps((prev) => [...new Set([...prev, ...selected])]);
        setSelected(new Set());
        if (editMode) endEdit(); // 고친 특이사항 대신 수정 전 입력하던 값으로 되돌린다
      } else {
        setSent(true);
      }
      setMsg({ ok: true, text: "팀즈로 전송되었습니다." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "전송 실패" });
      if (isStart) loadSent(false); // 다른 사람이 먼저 보고했을 수 있음 — 잠금 목록 새로고침
    } finally {
      setSharing(false);
    }
  }

  const rows: [string, number, string][] = isStart
    ? [
        ["금일 설치계획", selPlanned, "text-gray-700"],
        ...selGroups.map(
          (g): [string, number, string] => [
            `· ${g.operator}${g.route ? ` ${g.route}노선` : ""}`,
            g.planned,
            "text-gray-500",
          ],
        ),
        ["누적 완료", complete, "text-green-700"],
        ["잔여(설치대상)", remain, "text-gray-600"],
      ]
    : [
        ["금일 설치계획", todayPlanned, "text-gray-700"],
        ["진행중", inProgress, "text-amber-600"],
        ["금일완료", todayDone, "text-green-600"],
        ["누적완료", complete, "text-green-700"],
        ["잔여(설치대상)", remain, "text-gray-600"],
      ];

  // 보고용 이미지 — 선택한 운수사가 있으면 그 내용(보고 전 미리 받기), 없으면 방금 보고한 내용,
  // 그것도 없으면(다른 기기에서 보고) 보고 완료 운수사 전체로 만든다.
  const imgSrc = selGroups.length
    ? { groups: selGroups, startTime, note: note.trim(), revised: editMode }
    : (lastSent ?? {
        groups: planGroups.filter((g) => sentOps.includes(g.operator)),
        startTime,
        note: note.trim(),
        revised: false,
      });
  const image = {
    make: () =>
      startSheet(
        {
          label,
          startTime: imgSrc.startTime,
          todayPlanned: imgSrc.groups.reduce((s, g) => s + g.planned, 0),
          complete,
          remain,
          groups: imgSrc.groups,
          note: imgSrc.note,
          revised: imgSrc.revised,
        },
        projectLabel,
      ),
    fileName: sheetFileName(projectLabel, "설치시작보고", today),
  };

  // 보고 직후 — 설치계획·설치완료와 같은 완료 화면에서 보고용 이미지 저장 여부를 묻는다.
  // 확인을 누르면 아직 보고 안 한 운수사가 남았을 때는 폼으로 돌아가고, 다 했으면 창을 닫는다.
  if (isStart && startDone && lastSent) {
    return (
      <DonePanel
        title={lastSent.revised ? "수정한 내용으로 다시 보고했습니다" : "팀즈로 설치시작 보고를 보냈습니다"}
        sub={`${[...new Set(lastSent.groups.map((g) => g.operator))].join(", ")} · ${lastSent.groups
          .reduce((s, g) => s + g.planned, 0)
          .toLocaleString()}대`}
        onClose={() => (allSent ? onClose() : setStartDone(false))}
        btnClass="bg-orange-600 active:bg-orange-700"
        image={image}
      />
    );
  }

  // Tailwind가 스캔할 수 있게 정적 클래스로 분기
  const headBg = isStart ? "bg-orange-600" : "bg-indigo-600";
  const headSub = isStart ? "text-orange-200" : "text-indigo-200";
  const sendBtn = isStart
    ? "bg-orange-600 hover:bg-orange-700"
    : "bg-indigo-600 hover:bg-indigo-700";

  return (
    <div>
      <p className="mb-2 text-[11px] text-gray-400">아래 내용으로 설치 진행중 공유방에 전송됩니다.</p>
      <div className={`rounded-xl px-4 py-3 text-white ${headBg}`}>
        <p className="text-sm font-bold">
          {isStart
            ? `${brand} 단말기 설치 시작 보고${editMode ? " (수정)" : ""}`
            : `${brand} 단말기 설치 진행 현황`}
        </p>
        <p className={`text-xs ${headSub}`}>
          {isStart ? `${label} ${startTime} 설치 시작` : `${label} 기준`}
        </p>
      </div>
      <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-100">
        {rows.map(([k, v, color]) => (
          <li key={k} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">{k}</span>
            <span className={`tabular-nums font-bold ${color}`}>{v.toLocaleString()}대</span>
          </li>
        ))}
      </ul>
      {isStart && (
        <div className="mt-2 flex items-center gap-2">
          <label className="shrink-0 text-[11px] font-medium text-gray-500">시작시간</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-800 focus:border-orange-400 focus:outline-none"
          />
        </div>
      )}
      {isStart && (
        <div className="mt-2 space-y-1.5">
          {/* 설치팀별 담당 검수자 — 누르면 즉시 저장. 카드에는 안 나가고 그 팀 차량의 설치시작·완료 알림이 담당자 개인방으로 간다 */}
          {inspectorList.length > 0 && (
            <div className="mb-2 rounded-lg border border-orange-200 bg-orange-50/50 px-2.5 py-2">
              <p className="text-[11px] font-medium text-gray-600">
                설치팀별 담당 검수자{" "}
                <span className="font-normal text-gray-400">
                  (누르면 바로 저장 · 복수 선택 가능 · 그 팀이 작업한 차량의 설치 알림이 담당자 방으로 갑니다. 카드에는 표시되지 않습니다)
                </span>
              </p>
              {teamList.length === 0 ? (
                <p className="mt-1 text-[11px] text-amber-700">등록된 설치팀이 없습니다. 관리자 → 설치팀 탭에서 먼저 등록하세요.</p>
              ) : (
                teamList.map((team) => (
                  <div key={team} className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="w-full text-xs font-medium text-gray-700 sm:w-auto sm:min-w-[7rem]">{team}</span>
                    {inspectorList.map((name) => {
                      const picked = (teamMgr[team] ?? []).includes(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          aria-pressed={picked}
                          disabled={savingTeams.has(team)}
                          onClick={() => {
                            const cur = teamMgr[team] ?? [];
                            saveTeam(team, picked ? cur.filter((n) => n !== name) : [...cur, name]);
                          }}
                          // 장갑 낀 손으로 새벽에 누르는 화면이라 터치 영역을 키운다.
                          className={`min-h-[36px] rounded-full border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${
                            picked
                              ? "border-orange-600 bg-orange-600 text-white"
                              : "border-gray-300 bg-white text-gray-600"
                          }`}
                        >
                          {picked ? `✓ ${name}` : name}
                        </button>
                      );
                    })}
                    {savingTeams.has(team) && <span className="text-[10px] text-gray-400">저장 중…</span>}
                  </div>
                ))
              )}
            </div>
          )}
          {editMode ? (
            <div className="rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-orange-700">수정·재보고 중</p>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600"
                >
                  취소
                </button>
              </div>
              <p className="mt-0.5 text-[11px] text-orange-700">
                특이사항(·시작시간)을 고친 뒤 아래 &lsquo;수정 내용으로 재보고&rsquo;를 누르세요. 카드 제목에
                (수정)이 붙어 다시 나갑니다. 보고 완료된 다른 운수사도 함께 고를 수 있습니다.
              </p>
              {metaMissing.length > 0 && (
                <p className="mt-1 text-[11px] font-bold text-red-600">
                  {metaMissing.join(", ")}: 처음 보낸 특이사항·시작시간이 저장돼 있지 않습니다. 비어 있는 칸을 그대로
                  보내면 카드에서 지워지니, 시작시간과 특이사항을 다시 확인해 입력하세요.
                </p>
              )}
            </div>
          ) : (
            <p className="text-[11px] font-medium text-gray-500">
              보고할 운수사 선택{" "}
              <span className="font-normal text-gray-400">(보고 완료된 곳은 &lsquo;수정·재보고&rsquo;로 다시 보낼 수 있음)</span>
            </p>
          )}
          {operators.map((op) => {
            const done = sentOps.includes(op);
            const on = selected.has(op);
            // 평소엔 미보고 운수사만, 수정·재보고 중엔 보고 완료 운수사만 고를 수 있다
            const locked = editMode ? !done : done;
            return (
              <div
                key={op}
                className={`rounded-lg border px-2.5 py-1.5 ${
                  locked ? "border-gray-100 bg-gray-50" : "border-gray-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={locked}
                    onChange={(e) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(op);
                        else n.delete(op);
                        return n;
                      })
                    }
                    className="h-4 w-4 shrink-0 accent-orange-600"
                  />
                  <span
                    className={`min-w-0 flex-1 truncate text-xs font-medium ${
                      locked ? "text-gray-400" : "text-gray-700"
                    }`}
                  >
                    {op}
                  </span>
                  {done && (
                    <span className="shrink-0 text-[11px] font-medium text-green-600">보고 완료 ✓</span>
                  )}
                  {done && !editMode && (
                    <button
                      type="button"
                      onClick={() => startEdit(op)}
                      // 새벽 현장에서 누르는 화면 — 터치 영역 넉넉히
                      className="min-h-[32px] shrink-0 rounded-md border border-orange-300 bg-white px-2.5 text-[11px] font-semibold text-orange-700 active:bg-orange-50"
                    >
                      수정·재보고
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {isStart && (
        <div className="mt-2">
          <label className="mb-1 block text-[11px] font-medium text-gray-500">
            특이사항 <span className="font-normal text-gray-400">(선택 — 카드에 함께 표시)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="예) 우천으로 작업 지연 예상, ○○차량 입고 지연 등"
            className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-300 focus:border-orange-400 focus:outline-none"
          />
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg bg-gray-100 px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-200"
        >
          닫기
        </button>
        {isStart && imgSrc.groups.length > 0 && <SheetImageButton {...image} className="shrink-0" />}
        <button
          onClick={share}
          disabled={sharing || (isStart ? loadingSent || selected.size === 0 : sent)}
          className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${sendBtn}`}
        >
          {sharing
            ? "전송 중…"
            : isStart
              ? loadingSent
                ? "보고 현황 확인 중…"
                : editMode
                  ? "수정 내용으로 재보고"
                  : allSent
                    ? "보고 완료 ✓"
                    : "선택 운수사 팀즈로 보고"
              : sent
                ? "전송 완료 ✓"
                : "팀즈로 공유"}
        </button>
      </div>
      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      )}
    </div>
  );
}

// ── 3) 운행시작 보고 패널 (첫 운행시작 전 점검사항 공유) ────────
type Status = "" | "ok" | "issue";

// 체크 항목 한 줄 — 체크박스 + 라벨(+ 설명)
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

// 첫차 운행시작 전 점검 결과 → 팀즈(설치 진행중 공유방) 카드.
// 금일완료 리포트의 운행시작 점검란과 항목은 같지만, 첫차 운행 직후 바로 공유하는 창구.
function ServiceStartPanel({ onClose, hideBisKakao = false }: { onClose: () => void; hideBisKakao?: boolean }) {
  const INPUT =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

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
          hideBisKakao,
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

  if (step === "done") {
    return (
      <DonePanel
        title="팀즈로 전송했습니다"
        sub="설치 진행중 공유방으로 발송됨"
        onClose={onClose}
        btnClass="bg-emerald-600 active:bg-emerald-700"
      />
    );
  }

  return (
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

      {!hideBisKakao && (
        <>
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
        </>
      )}

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

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSend}
        disabled={busy}
        className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white active:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? "전송 중..." : "팀즈로 보내기"}
      </button>
    </div>
  );
}

// ── 통합 보고 버튼 + 탭 팝업 ─────────────────────────────────
type TabKey = "plan" | "start" | "progress" | "service";
const TABS: { key: TabKey; label: string }[] = [
  { key: "plan", label: "설치계획 보고" },
  { key: "start", label: "설치시작 보고" },
  { key: "progress", label: "진행중 공유" },
  { key: "service", label: "운행시작 보고" },
];

export default function ReportHub(props: {
  planToday: string; // 업무일 — 설치계획/라벨
  shareToday: string; // 공유 카드 라벨 기준일
  planGroups: PlanGroup[];
  todayPlanned: number;
  todayDone: number;
  complete: number;
  inProgress: number;
  remain: number;
  // 설치시작 보고 전용 — '금일 작업 시작 전(전일까지)' 누적완료·잔여.
  // 시작보고 전에 작업자가 먼저 시작해도 시작 카드 숫자가 흔들리지 않게 따로 받는다.
  startComplete: number;
  startRemain: number;
  inspectorList: string[]; // 등록된 검수자 이름 (관리자 검수자 탭 / TEAMS_INSPECTOR_WEBHOOKS 키) — 설치시작 보고 담당 선택지
  teamList?: string[]; // 등록된 설치팀 라벨 — 설치시작 보고에서 팀별 담당 검수자 지정
  hideBisKakao?: boolean; // 운행시작 보고 점검란에서 BIS(인천)·카카오(초정밀) 제외 (공항 B800)
  brand?: string; // 카드 제목의 프로젝트명 (기본 B820)
  projectLabel?: string; // 보고용 이미지 머리말 "[…]" (없으면 B820 문구)
}) {
  const projectLabel = props.projectLabel ?? DEFAULT_REPORT_LABEL;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("plan");

  function close() {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTab("plan");
          setOpen(true);
        }}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
      >
        <Icon name="megaphone" /> 보고
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
              <h2 className="text-sm font-bold text-blue-700">보고 / 공유</h2>
              <button
                onClick={close}
                className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            {/* 탭 바 */}
            <div className="flex gap-1 overflow-x-auto border-b border-gray-100 px-2 py-2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    tab === t.key
                      ? "bg-brand-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {tab === "plan" && (
                <PlanReportPanel
                  today={props.planToday}
                  planGroups={props.planGroups}
                  projectLabel={projectLabel}
                  onClose={close}
                />
              )}
              {tab === "start" && (
                <ShareStatPanel
                  kind="start"
                  today={props.shareToday}
                  todayPlanned={props.todayPlanned}
                  todayDone={props.todayDone}
                  complete={props.startComplete}
                  inProgress={props.inProgress}
                  remain={props.startRemain}
                  planGroups={props.planGroups}
                  inspectorList={props.inspectorList}
                  teamList={props.teamList}
                  brand={props.brand}
                  projectLabel={projectLabel}
                  onClose={close}
                />
              )}
              {tab === "service" && <ServiceStartPanel onClose={close} hideBisKakao={props.hideBisKakao} />}
              {tab === "progress" && (
                <ShareStatPanel
                  kind="progress"
                  today={props.shareToday}
                  todayPlanned={props.todayPlanned}
                  todayDone={props.todayDone}
                  complete={props.complete}
                  inProgress={props.inProgress}
                  remain={props.remain}
                  planGroups={props.planGroups}
                  inspectorList={[]} /* 진행중 공유 탭은 운수사·담당 선택 없음 */
                  brand={props.brand}
                  onClose={close}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
