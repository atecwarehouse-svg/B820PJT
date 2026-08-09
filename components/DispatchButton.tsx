"use client";

import { useEffect, useRef, useState } from "react";
import type { OperatorSchedule } from "@/lib/stats";
import { workDateString } from "@/lib/work-day";
import { DEFAULT_CHECKLIST, type Checklist } from "@/lib/checklist";
import type { InstallTeam } from "@/lib/settings";
import { loadTeamContacts, telHref } from "@/lib/team-call";

// 홈 화면 '배차표' 버튼 + 팝업 — 그날 설치할 운수사·노선을 골라 차량별
// 나가는 시간을 입력한다. 시간은 DB(dispatch_times)에 공용 저장되어
// 모든 기기에서 같은 배차표를 보고 수정할 수 있다(팀즈 전송 없음).

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0"),
); // 5분 단위

// 휴차는 out_time에 "OFF"로 저장 — 별도 컬럼 없이 기존 테이블 그대로 사용
const OFF = "OFF";

interface Entry {
  plate: string;
  route: string;
  outTime: string | null; // "HH:MM" 또는 "OFF"(휴차)
  checklist: boolean; // 체크리스트 작성 완료
  completed: boolean; // 설치완료(서버 판정 — 저장+설치전후 사진 충족)
  installing: boolean; // 설치중(서버 판정 — 시작했으나 아직 미완료)
  team: string; // 설치팀 팀명(records.team의 앞 토큰 — 서버 판정, 기록 없으면 빈값)
  tachoReason: string; // 타코 미연결 사유 — 빈 값이면 '타코 정상'(기본), 값이 있으면 미연결
  excluded: boolean; // 설치제외 — 나중에 설치(리스트에는 유지)
}

// 요약 타일 = 리스트 필터 버튼. 같은 타일을 다시 누르면 전체로 돌아온다.
// 집계는 설치대상(설치제외 아님)만 — 제외 차량을 세면 '검수완료 > 설치대상' 모순
const TILES: {
  key: string;
  label: string;
  color: string;
  match: (e: Entry) => boolean;
}[] = [
  {
    key: "target",
    label: "설치대상",
    color: "text-gray-900",
    match: (e) => !e.excluded,
  },
  {
    key: "installing",
    label: "설치중",
    color: "text-blue-600",
    match: (e) => !e.excluded && e.installing,
  },
  {
    // 검수대상 = 설치완료 차량 중 아직 검수완료 체크 안 된 것 = 남은 검수 물량
    key: "inspectTarget",
    label: "검수대상",
    color: "text-green-700",
    match: (e) => !e.excluded && e.completed && !e.checklist,
  },
  {
    key: "checked",
    label: "검수완료",
    color: "text-green-600",
    match: (e) => !e.excluded && e.checklist,
  },
  {
    key: "notyet",
    label: "미설치",
    color: "text-red-500",
    match: (e) => !e.excluded && !e.installing && !e.completed,
  },
  {
    key: "tachoOff",
    label: "타코 미연결",
    color: "text-amber-600",
    match: (e) => !e.excluded && !!e.tachoReason,
  },
  {
    key: "excluded",
    label: "설치제외",
    color: "text-gray-500",
    match: (e) => e.excluded,
  },
];

// 저장 대상 항목 — 이 기기에서 실제로 바꾼 항목만 서버로 보낸다(기기 간 덮어쓰기 방지)
type DirtyField = "outTime" | "checklist" | "tachoReason" | "excluded";

// "2026-07-15" → "2026.07.15"
function fmtDot(d: string): string {
  return d.replace(/-/g, ".");
}

// 노선 비교 키 — 드롭다운 선택지(loadOperatorSchedules)와 같은 규칙(trim, 빈값="미지정")으로
// 정규화해야 노선 없는 차량("미지정")이나 앞뒤 공백이 있는 노선도 필터에 정상 매칭된다.
function routeKey(route: string): string {
  return route.trim() || "미지정";
}

// 나가는 시간순 정렬 — 미입력은 뒤, 설치제외는 그 뒤, 휴차는 맨 뒤, 같은 시간은 차량번호순
function sortEntries(list: Entry[]): Entry[] {
  const key = (e: Entry) =>
    e.outTime === OFF ? "ZZ:ZZ" : e.excluded ? "ZY:ZY" : (e.outTime ?? "99:99");
  return [...list].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.plate.localeCompare(b.plate, "ko");
  });
}

// 행 우측 시/분 드롭다운 (ConsultationModal TimeField의 축약형)
// 자동 입력(간격 계산)으로 5분 단위가 아닌 분이 들어와도 표시되도록 현재 값을 선택지에 포함
function RowTime({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (v: string | null) => void;
}) {
  const [h, m] = value ? value.split(":") : ["", "00"];
  const minuteOptions = MINUTES.includes(m)
    ? MINUTES
    : [...MINUTES, m].sort((a, b) => Number(a) - Number(b));
  return (
    <div className="flex shrink-0 items-center gap-1">
      <select
        value={h}
        disabled={disabled}
        onChange={(e) => {
          const nh = e.target.value;
          onChange(nh ? `${nh}:${m || "00"}` : null);
        }}
        className="rounded-lg border border-gray-300 px-1.5 py-1.5 text-base focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
      >
        <option value="">--</option>
        {HOURS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span className="text-xs text-gray-500">시</span>
      <select
        value={h ? m : ""}
        disabled={disabled || !h}
        onChange={(e) => {
          if (h) onChange(`${h}:${e.target.value}`);
        }}
        className="rounded-lg border border-gray-300 px-1.5 py-1.5 text-base focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
      >
        {!h && <option value="">--</option>}
        {minuteOptions.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span className="text-xs text-gray-500">분</span>
    </div>
  );
}

export default function DispatchButton() {
  const [open, setOpen] = useState(false);

  // 선택지(운수사·예정일·노선) — 모달 처음 열 때 1회 로드
  const [operators, setOperators] = useState<OperatorSchedule[] | null>(null);
  const [optError, setOptError] = useState(false);
  // 금일(업무일) — 팝업을 열 때마다 다시 계산. 페이지를 계속 켜두면(PWA)
  // 다음 업무일에도 어제 날짜가 '금일'로 남는 문제 방지.
  const [today, setToday] = useState(() => workDateString(new Date()));

  const [operator, setOperator] = useState("");
  const [date, setDate] = useState("");
  const [routeFilter, setRouteFilter] = useState(""); // "" = 전체
  const [tileFilter, setTileFilter] = useState<string | null>(null); // 요약 타일 필터(null = 전체)
  const teamPhonesRef = useRef<InstallTeam[] | null>(null); // 설치팀 연락처 — 비번 1회만 묻도록 캐시

  const [entries, setEntries] = useState<Entry[]>([]);
  // 설치완료됐지만 검수완료가 아직 저장 안 된 차량 — 메인 리스트 맨 위에 고정.
  // 검수완료를 체크하고 저장해야 해제되어 원래 시간순 위치로 돌아간다(체크만으로는 유지).
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  // 이 기기에서 수정한 차량번호 → 수정한 항목들. 저장 시 이 차량의 이 항목들만 보낸다.
  // 차량 전체나 항목 전체를 보내면 다른 기기가 그 사이 저장한 값(예: 검수완료)을
  // 로드 시점의 옛 값으로 덮어쓴다.
  const dirtyRef = useRef<Map<string, Set<DirtyField>>>(new Map());
  // 목록 요청 순번 — 늦게 도착한 이전 응답이 최신 화면을 덮어쓰지 않게 한다.
  const loadSeqRef = useRef(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [dbReady, setDbReady] = useState(true);

  // 검수항목 보기 — 검수자가 차량 검수 중 참고하는 체크리스트(저장 없음).
  // 목록은 관리자 페이지에서 수정 가능(app_settings) — 처음 열 때 1회 로드, 실패 시 기본값.
  const [checklistView, setChecklistView] = useState(false);
  const [checklist, setChecklist] = useState<Checklist>(DEFAULT_CHECKLIST);
  const checklistLoadedRef = useRef(false);
  useEffect(() => {
    if (!checklistView || checklistLoadedRef.current) return;
    checklistLoadedRef.current = true;
    fetch("/api/checklist")
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j?.vehicle) && Array.isArray(j?.device))
          setChecklist(j);
      })
      .catch(() => {});
  }, [checklistView]);

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // 저장 요청 진행 중 표시(markDirty에서 참조)
  const reDirtiedRef = useRef<Map<string, Set<DirtyField>>>(new Map()); // 저장 중 재수정된 항목
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [tableView, setTableView] = useState(false); // 캡쳐용 표 보기

  // 자동 입력 — 첫차 출발시간 + 분 간격 + 차량별 순번으로 시간 일괄 계산
  const [autoView, setAutoView] = useState(false);
  const [autoH, setAutoH] = useState("06"); // 첫차 시
  const [autoM, setAutoM] = useState("00"); // 첫차 분
  const [autoGap, setAutoGap] = useState(5); // 분 간격
  const [seqMap, setSeqMap] = useState<Record<string, string>>({}); // plate → 순번
  const [autoAlert, setAutoAlert] = useState<string | null>(null); // 자동 입력 페이지 경고 팝업

  // 타코 미연결 사유 입력 팝업 — {차량번호, 입력 중인 사유}
  const [tachoEdit, setTachoEdit] = useState<{ plate: string; reason: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = workDateString(new Date());
    const dayChanged = t !== today;
    if (dayChanged) {
      // 업무일이 바뀐 채 다시 연 팝업 — 어제 선택·목록을 비우고 오늘 기준으로 다시
      setToday(t);
      setOperator("");
      setDate("");
      setEntries([]);
      setSaveMsg(null);
      dirtyRef.current = new Map();
    } else if (operators !== null) {
      return; // 같은 업무일에 다시 연 것 — 이미 불러온 일정·선택 유지
    }
    (async () => {
      try {
        const res = await fetch("/api/dispatch/options");
        const j = await res.json();
        const ops: OperatorSchedule[] = (j.operators ?? []).filter(
          (o: OperatorSchedule) => o.dates.length > 0,
        );
        setOperators(ops);
        setOptError(ops.length === 0);
        // 금일 설치 일정이 있으면 첫 운수사를 자동 선택해 리스트까지 바로 표시
        const todayOp = ops.find((o) => o.dates.some((d) => d.date === t));
        if (todayOp) {
          setOperator(todayOp.operator);
          setDate(t);
          loadList(todayOp.operator, t);
        }
      } catch {
        setOperators([]);
        setOptError(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 금일 설치 운수사들(노선·대수 포함) — 팝업 상단에 자동 표시
  const todayOps = (operators ?? [])
    .map((o) => ({
      operator: o.operator,
      todayDate: o.dates.find((d) => d.date === today),
    }))
    .filter(
      (
        x,
      ): x is {
        operator: string;
        todayDate: OperatorSchedule["dates"][number];
      } => !!x.todayDate,
    );

  // 금일 카드 탭 → 그 운수사의 오늘 배차표로 바로 이동
  // (직전 로드가 실패했으면 같은 카드를 다시 탭해 재시도할 수 있어야 한다)
  function selectToday(op: string) {
    if (operator === op && date === today && !listError) return;
    setOperator(op);
    setDate(today);
    setRouteFilter("");
    setSaveMsg(null);
    loadList(op, today);
  }

  const selectedOp = operators?.find((o) => o.operator === operator) ?? null;
  const selectedDate = selectedOp?.dates.find((d) => d.date === date) ?? null;

  function selectOperator(name: string) {
    setOperator(name);
    setRouteFilter("");
    setEntries([]);
    setSaveMsg(null);
    const op = operators?.find((o) => o.operator === name);
    if (!op) {
      setDate("");
      return;
    }
    // 예정일이 1개면 자동 선택, 오늘(업무일)이 목록에 있으면 오늘 우선
    const today = workDateString(new Date());
    const pick =
      op.dates.find((d) => d.date === today)?.date ??
      (op.dates.length === 1 ? op.dates[0].date : "");
    setDate(pick);
    if (pick) loadList(name, pick);
  }

  function selectDate(d: string) {
    setDate(d);
    setRouteFilter("");
    setEntries([]);
    setSaveMsg(null);
    if (d) loadList(operator, d);
  }

  async function loadList(op: string, d: string) {
    const seq = ++loadSeqRef.current;
    setTileFilter(null); // 다른 운수사·날짜를 부르면 필터는 전체로
    setListLoading(true);
    setListError("");
    try {
      const res = await fetch(
        `/api/dispatch?operator=${encodeURIComponent(op)}&date=${encodeURIComponent(d)}`,
      );
      const j = await res.json();
      // 운수사를 빠르게 바꾸면 이전 요청이 늦게 도착할 수 있다 — 최신 요청만 반영.
      // (이전 응답이 화면을 덮어쓰면 다른 운수사 이름으로 저장되는 사고가 난다)
      if (seq !== loadSeqRef.current) return;
      if (!res.ok)
        throw new Error(j?.error ?? "차량 목록을 불러오지 못했습니다.");
      const vehicles: Entry[] = j.vehicles ?? [];
      setEntries(vehicles);
      setPinned(
        new Set(
          vehicles
            .filter((v) => v.completed && !v.checklist)
            .map((v) => v.plate),
        ),
      );
      setDbReady(j.dbReady !== false);
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      setListError(
        e instanceof Error ? e.message : "차량 목록을 불러오지 못했습니다.",
      );
      setEntries([]);
    } finally {
      if (seq === loadSeqRef.current) {
        dirtyRef.current = new Map();
        setListLoading(false);
      }
    }
  }

  // 이 기기에서 바꾼 항목 표시 — plate별로 바꾼 필드를 기록.
  // 저장 요청이 날아가 있는 동안 바꾼 항목은 따로 표시해 두었다가,
  // 저장 성공 후에도 dirty로 남겨 다음 저장에 반영한다.
  function markDirty(plate: string, field: DirtyField) {
    const set = dirtyRef.current.get(plate) ?? new Set<DirtyField>();
    set.add(field);
    dirtyRef.current.set(plate, set);
    if (savingRef.current) {
      const s = reDirtiedRef.current.get(plate) ?? new Set<DirtyField>();
      s.add(field);
      reDirtiedRef.current.set(plate, s);
    }
  }

  function setTime(plate: string, v: string | null) {
    markDirty(plate, "outTime");
    setEntries((list) =>
      list.map((e) => (e.plate === plate ? { ...e, outTime: v } : e)),
    );
    setSaveMsg(null);
  }

  // 휴차 토글 — 체크하면 시간은 지워지고 맨 뒤로 정렬
  function toggleOff(plate: string, checked: boolean) {
    setTime(plate, checked ? OFF : null);
  }

  // 체크리스트 작성 토글
  function toggleChecklist(plate: string, checked: boolean) {
    markDirty(plate, "checklist");
    setEntries((list) =>
      list.map((e) => (e.plate === plate ? { ...e, checklist: checked } : e)),
    );
    setSaveMsg(null);
  }

  // 설치팀 📞 — 관리자 비밀번호 확인(홈 설치팀 호출과 같은 API) 후 그 팀 번호로 전화.
  // 한 번 통과하면 팝업이 열려 있는 동안은 다시 묻지 않는다.
  async function callTeam(team: string) {
    const list =
      teamPhonesRef.current ?? (await loadTeamContacts().catch(() => null));
    if (!list) return;
    teamPhonesRef.current = list;
    const norm = (s: string) => s.replace(/\s/g, "");
    const hit = list.find((c) => norm(c.team) === norm(team));
    if (!hit?.phone) {
      alert(
        `${team} 전화번호가 등록되어 있지 않습니다.\n관리자 페이지 → 설치팀 탭에서 추가하세요.`,
      );
      return;
    }
    window.location.href = telHref(hit.phone);
  }

  // 타코 미연결 — 기본은 '정상'이고, 배지를 누르면 사유 입력 팝업이 뜬다.
  // 사유를 적고 확인하면 그 자리에서 바로 저장한다(팝업만 닫고 저장을 잊으면 유실되므로).
  function applyTachoReason(plate: string, reason: string) {
    const next = entries.map((e) =>
      e.plate === plate ? { ...e, tachoReason: reason } : e,
    );
    markDirty(plate, "tachoReason");
    setEntries(next);
    setTachoEdit(null);
    handleSave(next); // setEntries 반영을 기다리지 않도록 새 목록을 직접 넘긴다
  }

  // 설치제외 토글 — 나중에 설치할 차량. 시간은 지우고 리스트에는 그대로 남는다.
  function toggleExcluded(plate: string, checked: boolean) {
    markDirty(plate, "excluded");
    if (checked) markDirty(plate, "outTime"); // 체크 시 시간도 지워 저장
    setEntries((list) =>
      list.map((e) =>
        e.plate === plate
          ? { ...e, excluded: checked, ...(checked ? { outTime: null } : {}) }
          : e,
      ),
    );
    setSaveMsg(null);
  }

  // 자동 입력 대상 — 노선 필터 적용, 설치제외만 제외(휴차는 목록에서 직접 체크 가능).
  const autoTargets = (
    routeFilter
      ? entries.filter((e) => routeKey(e.route) === routeFilter)
      : entries
  ).filter((e) => !e.excluded);

  // 자동 입력 적용 — 순번 n 차량의 시간 = 첫차 + (n−1)×간격. 순번 없는 차량은 그대로.
  function applyAuto() {
    const base = Number(autoH) * 60 + Number(autoM);
    const timeByPlate = new Map<string, string>();
    for (const e of autoTargets) {
      if (e.outTime === OFF) continue; // 휴차는 건너뜀
      const raw = (seqMap[e.plate] ?? "").trim();
      if (!/^\d+$/.test(raw) || Number(raw) < 1) continue;
      // 자정을 넘어가면 00:xx로 wrap되어 첫차보다 앞으로 정렬되므로 23:59에서 멈춘다
      const t = Math.min(base + (Number(raw) - 1) * autoGap, 24 * 60 - 1);
      timeByPlate.set(
        e.plate,
        `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`,
      );
    }
    if (timeByPlate.size === 0) {
      // 페이지를 닫지 않고 그 자리에서 안내 팝업
      setAutoAlert(
        "순번이 입력되지 않았습니다.\n차량별 나가는 순번을 입력해주세요.",
      );
      return;
    }
    for (const p of timeByPlate.keys()) markDirty(p, "outTime");
    setEntries((list) =>
      list.map((e) =>
        timeByPlate.has(e.plate)
          ? { ...e, outTime: timeByPlate.get(e.plate)! }
          : e,
      ),
    );
    setSaveMsg({
      ok: true,
      text: `${timeByPlate.size}대 시간이 자동 입력되었습니다 — 저장을 눌러야 반영됩니다.`,
    });
    setAutoView(false);
  }

  // list: 방금 바꾼 목록을 직접 넘길 수 있다(상태 반영을 기다리지 않고 저장할 때).
  async function handleSave(list: Entry[] = entries) {
    if (saving) return;
    // 이 기기에서 바꾼 차량의 바꾼 항목만 저장 — 다른 기기가 먼저 저장한 값을
    // (다른 항목이라도) 로드 시점의 옛 값으로 덮어쓰지 않는다.
    const snapshot = new Map(
      [...dirtyRef.current].map(([p, s]) => [p, new Set(s)] as const),
    );
    const changed = list
      .filter((e) => snapshot.has(e.plate))
      .map((e) => {
        const fields = snapshot.get(e.plate)!;
        return {
          plate: e.plate,
          route: e.route,
          ...(fields.has("outTime") ? { outTime: e.outTime } : {}),
          ...(fields.has("checklist") ? { checklist: e.checklist } : {}),
          ...(fields.has("tachoReason") ? { tachoReason: e.tachoReason } : {}),
          ...(fields.has("excluded") ? { excluded: e.excluded } : {}),
        };
      });
    if (changed.length === 0) {
      setSaveMsg({ ok: true, text: "변경된 내용이 없습니다." });
      return;
    }
    setSaving(true);
    savingRef.current = true;
    reDirtiedRef.current = new Map();
    setSaveMsg(null);
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operator, date, entries: changed }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "저장에 실패했습니다.");
      // 방금 보낸 항목만 dirty 해제 — 저장 요청 중에 새로/다시 바꾼 항목은 남겨서
      // 다음 저장 때 반영되게 한다(요청 중 수정 유실 방지).
      for (const [plate, sentFields] of snapshot) {
        const cur = dirtyRef.current.get(plate);
        if (!cur) continue;
        const redone = reDirtiedRef.current.get(plate);
        for (const f of sentFields) {
          if (!redone?.has(f)) cur.delete(f);
        }
        if (cur.size === 0) dirtyRef.current.delete(plate);
      }
      // 검수완료가 저장된 차량은 상단 고정 해제 → 원래 시간순 위치로
      setPinned((prev) => {
        const next = new Set(prev);
        for (const c of changed) if (c.checklist) next.delete(c.plate);
        return next;
      });
      setSaveMsg({
        ok: true,
        text: "저장됨 ✓ 모든 기기에서 같은 배차표가 보입니다.",
      });
    } catch (e) {
      setSaveMsg({
        ok: false,
        text: e instanceof Error ? e.message : "저장에 실패했습니다.",
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // 표시 목록 — 노선 필터 적용 후 시간순 정렬
  const visible = sortEntries(
    routeFilter
      ? entries.filter((e) => routeKey(e.route) === routeFilter)
      : entries,
  );
  const timedCount = visible.filter(
    (e) => e.outTime && e.outTime !== OFF,
  ).length;
  const offCount = visible.filter((e) => e.outTime === OFF).length;
  const exclCount = visible.filter((e) => e.excluded).length;
  // 메인 리스트 전용 — 타일 필터 적용 후 고정 차량을 맨 위로(캡쳐용 표는 항상 전체·시간순)
  const shown = tileFilter
    ? visible.filter(TILES.find((t) => t.key === tileFilter)!.match)
    : visible;
  const mainList = [
    ...shown.filter((e) => pinned.has(e.plate)),
    ...shown.filter((e) => !pinned.has(e.plate)),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTableView(false);
        }}
        className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-semibold text-blue-700 shadow-sm active:bg-blue-100"
      >
        🚌 배차표
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="mb-12 mt-8 w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between rounded-t-2xl bg-blue-600 px-4 py-3 text-white">
              <div>
                <p className="text-sm font-bold">🚌 배차표</p>
                <p className="text-xs text-blue-200">
                  차량별 나가는 시간 — 시간순 자동 정렬
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-0.5 text-lg leading-none text-blue-100 active:bg-blue-700"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              {/* 검수항목 — 검수자가 보면서 확인하는 고정 리스트 */}
              <button
                type="button"
                onClick={() => setChecklistView(true)}
                className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 active:bg-emerald-100"
              >
                ✅ 검수항목 보기
              </button>

              {/* 저장 — 검수항목 보기 바로 아래 */}
              {date && !listLoading && entries.length > 0 && (
                <div>
                  <button
                    onClick={() => handleSave()}
                    disabled={saving || !dbReady}
                    className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "저장 중…" : "💾 저장"}
                  </button>
                  {saveMsg && (
                    <p
                      className={`mt-1.5 text-center text-xs ${
                        saveMsg.ok ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {saveMsg.text}
                    </p>
                  )}
                </div>
              )}

              {/* 금일 설치 — 오늘 일정이 있는 운수사·노선 자동 표시 */}
              {operators !== null && !optError && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    금일 설치 ({fmtDot(today)})
                  </label>
                  {todayOps.length === 0 ? (
                    <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400">
                      금일 설치 일정이 없습니다. 아래에서 직접 선택하세요.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {todayOps.map((t) => {
                        const active =
                          operator === t.operator && date === today;
                        return (
                          <button
                            key={t.operator}
                            type="button"
                            onClick={() => selectToday(t.operator)}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left ${
                              active
                                ? "border-blue-500 bg-blue-50"
                                : "border-gray-200 bg-white active:bg-gray-50"
                            }`}
                          >
                            <span
                              className={`shrink-0 text-sm font-semibold ${
                                active ? "text-blue-700" : "text-gray-800"
                              }`}
                            >
                              {t.operator}
                            </span>
                            {/* 노선은 한 줄에 4개까지, 넘으면 다음 줄 — 한 줄 고정이면 카드 밖으로 넘친다 */}
                            <span className="flex min-w-0 flex-1 flex-wrap justify-end gap-y-0.5 text-[11px] leading-snug text-gray-500">
                              {t.todayDate.routes.map((r) => (
                                <span
                                  key={r.route}
                                  className="w-1/4 truncate text-right"
                                >
                                  {r.route} {r.count}대
                                </span>
                              ))}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 운수사 직접 선택 */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  운수사 직접 선택
                </label>
                {operators === null ? (
                  <p className="text-sm text-gray-400">불러오는 중…</p>
                ) : optError ? (
                  <p className="text-sm text-red-500">
                    설치 일정을 불러오지 못했습니다. 잠시 후 다시 열어주세요.
                  </p>
                ) : (
                  <select
                    value={operator}
                    onChange={(e) => selectOperator(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">운수사 선택</option>
                    {operators.map((o) => (
                      <option key={o.operator} value={o.operator}>
                        {o.operator}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* 설치 예정일 */}
              {selectedOp && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    설치 예정일
                  </label>
                  <select
                    value={date}
                    onChange={(e) => selectDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">날짜 선택</option>
                    {selectedOp.dates.map((d) => (
                      <option key={d.date} value={d.date}>
                        {fmtDot(d.date)} ({d.count}대)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 노선 */}
              {selectedDate && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    노선
                  </label>
                  <select
                    value={routeFilter}
                    onChange={(e) => setRouteFilter(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">전체 ({selectedDate.count}대)</option>
                    {selectedDate.routes.map((r) => (
                      <option key={r.route} value={r.route}>
                        {r.route} ({r.count}대)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 자동 입력 · 표로 보기 (노선 선택 아래) */}
              {selectedDate && !listLoading && entries.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSeqMap({});
                      setAutoAlert(null);
                      setAutoView(true);
                    }}
                    className="rounded-lg border border-orange-300 bg-white px-4 py-2.5 text-sm font-semibold text-orange-600 active:bg-orange-50"
                  >
                    ⚡ 배차표 자동 입력
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableView(true)}
                    className="rounded-lg border border-blue-300 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 active:bg-blue-50"
                  >
                    📋 표로 보기 (캡쳐용)
                  </button>
                </div>
              )}

              {/* 차량 리스트 */}
              {date && (
                <div>
                  {listLoading ? (
                    <p className="py-4 text-center text-sm text-gray-400">
                      차량 목록 불러오는 중…
                    </p>
                  ) : listError ? (
                    <p className="py-2 text-sm text-red-500">{listError}</p>
                  ) : visible.length === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-400">
                      해당 날짜의 차량이 없습니다.
                    </p>
                  ) : (
                    <>
                      {!dbReady && (
                        <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                          시간을 저장하려면 DB 준비(migration_dispatch.sql
                          실행)가 필요합니다. 관리자에게 문의하세요.
                        </div>
                      )}
                      {/* 관리자용 한눈 요약 — 탭하면 그 항목만 보기(다시 탭하면 전체) */}
                      <div className="mb-2 grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 text-center">
                        {TILES.map((t) => {
                          const on = tileFilter === t.key;
                          return (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => setTileFilter(on ? null : t.key)}
                              className={`py-2 ${on ? "bg-blue-100" : "bg-gray-50 active:bg-gray-100"}`}
                            >
                              <p
                                className={`text-[10px] ${on ? "font-semibold text-blue-700" : "text-gray-500"}`}
                              >
                                {t.label}
                              </p>
                              <p
                                className={`text-base font-bold tabular-nums ${t.color}`}
                              >
                                {visible.filter(t.match).length}
                              </p>
                            </button>
                          );
                        })}
                        {/* 7칸이라 4열 격자의 마지막 한 칸을 메운다(안 채우면 회색 구멍) */}
                        <span className="bg-gray-50" />
                      </div>
                      <p className="mb-1 text-[11px] text-gray-400">
                        {tileFilter ? (
                          <>
                            {TILES.find((t) => t.key === tileFilter)?.label}{" "}
                            {mainList.length}대만 보는 중 — 타일을 다시 누르면
                            전체
                          </>
                        ) : (
                          <>
                            시간 입력 {timedCount}대
                            {offCount > 0 && ` · 휴차 ${offCount}대`} — 시간을
                            고르면 이른 순서로 정렬됩니다
                          </>
                        )}
                      </p>
                      {mainList.length === 0 && (
                        <p className="rounded-lg border border-gray-200 py-4 text-center text-sm text-gray-400">
                          해당 차량이 없습니다.
                        </p>
                      )}
                      <ul
                        className={`divide-y divide-gray-100 rounded-lg border border-gray-200 ${mainList.length === 0 ? "hidden" : ""}`}
                      >
                        {mainList.map((e) => {
                          const isOff = e.outTime === OFF;
                          return (
                            <li
                              key={e.plate}
                              className={`px-3 py-2 ${
                                isOff
                                  ? "bg-red-50/60"
                                  : e.excluded
                                    ? "bg-gray-100/70"
                                    : ""
                              }`}
                            >
                              <div className="min-w-0">
                                <p
                                  className={`text-sm font-medium ${
                                    isOff
                                      ? "text-red-400"
                                      : e.excluded
                                        ? "text-gray-400"
                                        : "text-gray-800"
                                  }`}
                                >
                                  {e.plate}
                                  {e.completed && (
                                    <span className="ml-1.5 rounded bg-green-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-green-700">
                                      설치완료
                                    </span>
                                  )}
                                  {!e.completed && e.installing && (
                                    <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-blue-700">
                                      설치중
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setTachoEdit({
                                        plate: e.plate,
                                        reason: e.tachoReason,
                                      })
                                    }
                                    className={`ml-1.5 rounded border px-1.5 py-0.5 align-middle text-[10px] font-semibold ${
                                      e.tachoReason
                                        ? "border-amber-400 bg-amber-100 text-amber-700"
                                        : "border-gray-300 bg-gray-50 text-gray-500"
                                    }`}
                                  >
                                    {e.tachoReason ? "⚠ 타코 미연결" : "타코 정상"}
                                  </button>
                                  {e.team && (
                                    <>
                                      <span className="ml-1.5 align-middle text-[11px] text-gray-500">
                                        {e.team}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => callTeam(e.team)}
                                        className="ml-1 rounded border border-green-300 bg-green-50 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-green-700 active:bg-green-100"
                                        aria-label={`${e.team} 전화걸기`}
                                      >
                                        📞
                                      </button>
                                    </>
                                  )}
                                  {e.excluded && (
                                    <span className="ml-1.5 rounded bg-gray-200 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-gray-600">
                                      설치제외
                                    </span>
                                  )}
                                </p>
                                {!routeFilter && e.route && (
                                  <p className="text-[11px] text-gray-400">
                                    {e.route}
                                  </p>
                                )}
                              </div>
                              {/* 체크 3개는 왼쪽, 시간은 오른쪽 고정 — 행마다 시간 열이 같은 자리에 온다 */}
                              <div className="mt-1 flex items-center justify-between gap-2">
                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                  <label className="flex shrink-0 cursor-pointer items-center gap-1">
                                    <input
                                      type="checkbox"
                                      checked={e.checklist}
                                      onChange={(ev) =>
                                        toggleChecklist(
                                          e.plate,
                                          ev.target.checked,
                                        )
                                      }
                                      className="h-4 w-4 accent-green-600"
                                    />
                                    <span
                                      className={`text-xs ${
                                        e.checklist
                                          ? "font-semibold text-green-700"
                                          : "text-gray-500"
                                      }`}
                                    >
                                      검수완료
                                    </span>
                                  </label>
                                  <label className="flex shrink-0 cursor-pointer items-center gap-1">
                                    <input
                                      type="checkbox"
                                      checked={e.excluded}
                                      onChange={(ev) =>
                                        toggleExcluded(
                                          e.plate,
                                          ev.target.checked,
                                        )
                                      }
                                      className="h-4 w-4 accent-gray-500"
                                    />
                                    <span
                                      className={`text-xs ${
                                        e.excluded
                                          ? "font-semibold text-gray-700"
                                          : "text-gray-500"
                                      }`}
                                    >
                                      설치제외
                                    </span>
                                  </label>
                                  <label
                                    className={`flex shrink-0 items-center gap-1 ${
                                      e.excluded
                                        ? "opacity-40"
                                        : "cursor-pointer"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isOff}
                                      disabled={e.excluded}
                                      onChange={(ev) =>
                                        toggleOff(e.plate, ev.target.checked)
                                      }
                                      className="h-4 w-4 accent-red-600"
                                    />
                                    <span
                                      className={`text-xs ${
                                        isOff
                                          ? "font-semibold text-red-600"
                                          : "text-gray-500"
                                      }`}
                                    >
                                      휴차
                                    </span>
                                  </label>
                                </div>
                                <RowTime
                                  value={isOff ? null : e.outTime}
                                  disabled={isOff || e.excluded}
                                  onChange={(v) => setTime(e.plate, v)}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* 타코 미연결 사유 입력 — 기본은 '타코 정상', 사유를 적어야 미연결이 된다.
              확인을 누르면 그 자리에서 저장까지 끝낸다(리포트 특이사항에 자동으로 들어감). */}
          {tachoEdit && (
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
              onClick={(e) => {
                e.stopPropagation();
                setTachoEdit(null);
              }}
            >
              <div
                className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-center text-sm font-bold text-gray-800">
                  타코 미연결 사유
                </p>
                <p className="mt-0.5 text-center text-xs text-gray-500">
                  {tachoEdit.plate}
                </p>
                <textarea
                  value={tachoEdit.reason}
                  onChange={(e) =>
                    setTachoEdit({ ...tachoEdit, reason: e.target.value })
                  }
                  rows={3}
                  maxLength={200}
                  autoFocus
                  placeholder="예) 타코메타 단자 불량으로 연결 불가"
                  className="mt-3 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  사유를 적으면 &lsquo;타코 미연결&rsquo;로 표시되고, 금일 완료
                  리포트 특이사항에 자동으로 들어갑니다.
                </p>
                <div className="mt-3 flex gap-2">
                  {/* 이미 미연결인 차량만 '정상으로 되돌리기'를 보여준다 */}
                  {entries.find((e) => e.plate === tachoEdit.plate)
                    ?.tachoReason ? (
                    <button
                      type="button"
                      onClick={() => applyTachoReason(tachoEdit.plate, "")}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-600 active:bg-gray-100"
                    >
                      정상으로 되돌리기
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTachoEdit(null)}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-600 active:bg-gray-100"
                    >
                      취소
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!tachoEdit.reason.trim()}
                    onClick={() =>
                      applyTachoReason(tachoEdit.plate, tachoEdit.reason.trim())
                    }
                    className="flex-1 rounded-lg bg-amber-600 px-3 py-2.5 text-sm font-semibold text-white active:bg-amber-700 disabled:opacity-40"
                  >
                    미연결 저장
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 검수항목 — 검수자가 차량 옆에서 보면서 확인하는 고정 리스트 (저장 없음) */}
          {checklistView && (
            <div
              className="fixed inset-0 z-[60] overflow-y-auto bg-white pb-16"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5">
                <p className="text-sm font-bold text-gray-800">✅ 검수항목</p>
                <button
                  type="button"
                  onClick={() => setChecklistView(false)}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-600 active:bg-gray-200"
                >
                  ✕ 닫기
                </button>
              </div>
              <div className="space-y-4 px-4 py-4">
                {/* 1. 차량 이상유무 */}
                <section className="rounded-xl border border-emerald-200 bg-white shadow-sm">
                  <h3 className="rounded-t-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white">
                    1. 차량 이상유무
                  </h3>
                  <ol className="divide-y divide-gray-100 px-3 text-sm text-gray-800">
                    {checklist.vehicle.map(({ t, s }, i) => (
                      <li key={i} className="flex items-baseline gap-2 py-2">
                        <span className="w-5 shrink-0 text-right text-xs font-bold text-emerald-600">
                          {i + 1}.
                        </span>
                        <span className="font-medium">{t}</span>
                        {s && (
                          <span className="text-xs text-gray-500">({s})</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>

                {/* 2. 단말기 설치 상태 */}
                <section className="rounded-xl border border-blue-200 bg-white shadow-sm">
                  <h3 className="rounded-t-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white">
                    2. 단말기 설치 상태
                  </h3>
                  <ol className="divide-y divide-gray-100 px-3 text-sm text-gray-800">
                    {checklist.device.map(({ t, s }, i) => (
                      <li key={i} className="flex items-baseline gap-2 py-2">
                        <span className="w-5 shrink-0 text-right text-xs font-bold text-blue-600">
                          {i + 1}.
                        </span>
                        <span className="font-medium">{t}</span>
                        {s && (
                          <span className="text-xs text-gray-500">({s})</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>

                <p className="text-center text-[11px] text-gray-400">
                  검수 완료 후 배차표 리스트에서 차량별 &lsquo;검수완료&rsquo;를
                  체크해주세요.
                </p>
              </div>
            </div>
          )}

          {/* 자동 입력 — 첫차 출발시간·분 간격을 정하고 차량별 순번만 쓰면
              나가는 시간이 일괄 계산된다. 적용 후 저장을 눌러야 DB 반영. */}
          {autoView && (
            <div
              className="fixed inset-0 z-[60] overflow-y-auto bg-white pb-24"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5">
                <p className="text-sm font-bold text-gray-800">
                  ⚡ 배차표 자동 입력
                </p>
                <button
                  type="button"
                  onClick={() => setAutoView(false)}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-600 active:bg-gray-200"
                >
                  ✕ 닫기
                </button>
              </div>
              <div className="px-4 py-4">
                <p className="text-xs text-gray-500">
                  {operator} · {fmtDot(date)}
                  {routeFilter && ` · ${routeFilter}`} — 첫차 시간과 간격을
                  정하고, 차량마다 나가는 순번을 적으면 시간이 자동 계산됩니다.
                </p>

                {/* 첫차 출발시간 + 분 간격 */}
                <div className="mt-3 flex flex-wrap items-end gap-4 rounded-xl border border-orange-200 bg-orange-50 px-3 py-3">
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-gray-600">
                      첫차 출발시간
                    </p>
                    <div className="flex items-center gap-1">
                      <select
                        value={autoH}
                        onChange={(e) => setAutoH(e.target.value)}
                        className="rounded-lg border border-gray-300 bg-white px-1.5 py-1.5 text-base focus:border-orange-500 focus:outline-none"
                      >
                        {HOURS.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-gray-500">시</span>
                      <select
                        value={autoM}
                        onChange={(e) => setAutoM(e.target.value)}
                        className="rounded-lg border border-gray-300 bg-white px-1.5 py-1.5 text-base focus:border-orange-500 focus:outline-none"
                      >
                        {MINUTES.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-gray-500">분</span>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-gray-600">
                      배차 간격
                    </p>
                    <div className="flex items-center gap-1">
                      <select
                        value={autoGap}
                        onChange={(e) => setAutoGap(Number(e.target.value))}
                        className="rounded-lg border border-gray-300 bg-white px-1.5 py-1.5 text-base focus:border-orange-500 focus:outline-none"
                      >
                        {Array.from({ length: 90 }, (_, i) => i + 1).map(
                          (n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ),
                        )}
                      </select>
                      <span className="text-xs text-gray-500">분 간격</span>
                    </div>
                  </div>
                </div>

                {/* 차량별 순번 입력 */}
                <p className="mb-1 mt-4 text-[11px] text-gray-400">
                  나가는 순번 (1 = 첫차 · 빈칸은 건너뜀 · 설치제외 차량은
                  목록에서 제외 · 휴차는 체크)
                </p>
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {autoTargets.map((e) => {
                    const isOff = e.outTime === OFF;
                    const raw = (seqMap[e.plate] ?? "").trim();
                    const valid =
                      !isOff && /^\d+$/.test(raw) && Number(raw) >= 1;
                    const t = valid
                      ? Math.min(
                          Number(autoH) * 60 +
                            Number(autoM) +
                            (Number(raw) - 1) * autoGap,
                          24 * 60 - 1,
                        )
                      : null;
                    return (
                      <li
                        key={e.plate}
                        className={`flex items-center justify-between gap-2 px-3 py-2 ${
                          isOff ? "bg-red-50/60" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p
                            className={`truncate text-sm font-medium ${
                              isOff ? "text-red-400" : "text-gray-800"
                            }`}
                          >
                            {e.plate}
                          </p>
                          {!routeFilter && e.route && (
                            <p className="text-[11px] text-gray-400">
                              {e.route}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {t !== null && (
                            <span className="text-xs font-semibold tabular-nums text-orange-600">
                              {String(Math.floor(t / 60)).padStart(2, "0")}:
                              {String(t % 60).padStart(2, "0")}
                            </span>
                          )}
                          <label className="flex cursor-pointer items-center gap-1">
                            <input
                              type="checkbox"
                              checked={isOff}
                              onChange={(ev) =>
                                toggleOff(e.plate, ev.target.checked)
                              }
                              className="h-4 w-4 accent-red-600"
                            />
                            <span
                              className={`text-xs ${
                                isOff
                                  ? "font-semibold text-red-600"
                                  : "text-gray-500"
                              }`}
                            >
                              휴차
                            </span>
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={isOff ? "" : (seqMap[e.plate] ?? "")}
                            disabled={isOff}
                            onChange={(ev) =>
                              setSeqMap((m) => ({
                                ...m,
                                [e.plate]: ev.target.value.replace(
                                  /[^0-9]/g,
                                  "",
                                ),
                              }))
                            }
                            placeholder={isOff ? "휴차" : "순번"}
                            className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-center text-base tabular-nums focus:border-orange-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-300"
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* 미입력 경고 팝업 — 자동 입력 페이지 안에서 표시 */}
              {autoAlert && (
                <div
                  className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
                  onClick={() => setAutoAlert(null)}
                >
                  <div
                    className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <div className="text-4xl">⚠️</div>
                    <p className="mt-2 whitespace-pre-line text-sm font-semibold text-gray-800">
                      {autoAlert}
                    </p>
                    <button
                      type="button"
                      onClick={() => setAutoAlert(null)}
                      className="mt-4 w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white active:bg-orange-700"
                    >
                      확인
                    </button>
                  </div>
                </div>
              )}

              {/* 적용 버튼 — 하단 고정 */}
              <div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/95 p-3 backdrop-blur">
                <button
                  type="button"
                  onClick={applyAuto}
                  className="mx-auto block w-full max-w-md rounded-lg bg-orange-600 px-4 py-3 text-sm font-semibold text-white active:bg-orange-700"
                >
                  ⚡ 시간 자동 입력
                </button>
              </div>
            </div>
          )}

          {/* 캡쳐용 표 보기 — 흰 배경 전체화면. 상단 바(닫기)만 있고 나머지는
              깔끔한 표라서 모바일 캡쳐 후 그대로 공유할 수 있다. */}
          {tableView && (
            <div
              className="fixed inset-0 z-[60] overflow-y-auto bg-white"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5">
                <p className="text-sm font-bold text-gray-800">
                  📋 배차표 (캡쳐용)
                </p>
                <button
                  type="button"
                  onClick={() => setTableView(false)}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-600 active:bg-gray-200"
                >
                  ✕ 닫기
                </button>
              </div>
              <div className="px-4 py-4">
                <p className="text-base font-bold text-gray-900">
                  {operator} 배차표
                  {routeFilter && ` · ${routeFilter}`}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {fmtDot(date)} · {visible.length}대
                  {timedCount > 0 && ` · 시간입력 ${timedCount}대`}
                  {exclCount > 0 && ` · 설치제외 ${exclCount}대`}
                  {offCount > 0 && ` · 휴차 ${offCount}대`}
                </p>
                <table className="mt-3 w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-blue-600 text-white">
                      <th className="w-9 border border-blue-700 px-1 py-1.5 text-center text-xs font-semibold">
                        번호
                      </th>
                      <th className="border border-blue-700 px-2 py-1.5 text-center text-xs font-semibold">
                        노선
                      </th>
                      <th className="border border-blue-700 px-2 py-1.5 text-center text-xs font-semibold">
                        차량번호
                      </th>
                      <th className="border border-blue-700 px-2 py-1.5 text-center text-xs font-semibold">
                        나가는 시간
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((e, i) => {
                      const isOff = e.outTime === OFF;
                      return (
                        <tr
                          key={e.plate}
                          className={
                            isOff
                              ? "bg-red-50"
                              : e.excluded
                                ? "bg-gray-100"
                                : i % 2
                                  ? "bg-gray-50"
                                  : "bg-white"
                          }
                        >
                          <td className="border border-gray-300 px-1 py-1.5 text-center text-xs text-gray-500">
                            {i + 1}
                          </td>
                          <td className="border border-gray-300 px-2 py-1.5 text-center text-gray-700">
                            {e.route || "-"}
                          </td>
                          <td
                            className={`border border-gray-300 px-2 py-1.5 text-center font-medium ${
                              isOff ? "text-red-500" : "text-gray-900"
                            }`}
                          >
                            {e.plate}
                          </td>
                          <td
                            className={`border border-gray-300 px-2 py-1.5 text-center font-semibold ${
                              isOff
                                ? "text-red-600"
                                : e.excluded
                                  ? "text-gray-600"
                                  : e.outTime
                                    ? "text-blue-700"
                                    : "text-gray-300"
                            }`}
                          >
                            {isOff
                              ? "휴차"
                              : e.excluded
                                ? "설치제외"
                                : (e.outTime ?? "-")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-center text-[11px] text-gray-400">
                  이 화면을 캡쳐해 공유하세요 · ✕ 닫기를 누르면 입력 화면으로
                  돌아갑니다
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
