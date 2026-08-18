import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll, chunk } from "@/lib/supabase/paginate";
import { BEFORE_SLOTS, AFTER_SLOTS } from "@/lib/slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 배차표 — 운수사·설치일별 차량 나가는 시간(공용 저장).
// GET  ?operator=&date= : 해당일 차량 목록 + 저장된 시간·체크리스트 + 설치완료 여부
// POST { operator, date, entries } : (date, plate) 기준 upsert

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export async function GET(req: NextRequest) {
  const operator = (req.nextUrl.searchParams.get("operator") ?? "").trim();
  const date = (req.nextUrl.searchParams.get("date") ?? "").trim();
  if (!operator || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "운수사와 날짜를 확인하세요." }, { status: 400 });
  }

  const supabase = createServiceClient();
  type VehicleRow = { plate: string; route: string | null };
  const { data, error } = await supabase
    .from("vehicles")
    .select("plate, route")
    .eq("operator", operator)
    .eq("planned_date", date)
    .order("route")
    .order("plate")
    .range(0, 999);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const vehicles = (data ?? []) as unknown as VehicleRow[];
  const plates = vehicles.map((v) => v.plate);

  // 저장된 시간·체크리스트·타코 미연결 사유·설치제외 — 없는 컬럼(마이그레이션 전)은 단계적으로 빼고 재시도
  let dbReady = true;
  const times = new Map<string, string | null>();
  const checks = new Set<string>();
  const tachoReasons = new Map<string, string>();
  const excludes = new Set<string>();
  type SavedRow = {
    plate: string;
    out_time: string | null;
    checklist?: boolean;
    tacho_reason?: string | null;
    excluded?: boolean;
  };
  let savedRows: SavedRow[] | null = null;
  const SELECTS = [
    "plate, out_time, checklist, tacho_reason, excluded",
    "plate, out_time, checklist, excluded",
    "plate, out_time, checklist",
    "plate, out_time",
  ];
  // 이 화면에 필요한 건 위에서 뽑은 차량들뿐이다. 날짜만으로 받으면 그날 모든
  // 운수사의 행이 섞여 상한(1000행)에 걸리고, 넘치는 만큼 시간·검수완료·설치제외가
  // 조용히 사라진다. 차량번호로 100대씩 나눠 필요한 행만 받는다.
  for (const cols of SELECTS) {
    const rows: SavedRow[] = [];
    let failed: { message: string } | null = null;
    for (const part of chunk(plates)) {
      const res = await supabase
        .from("dispatch_times")
        .select(cols)
        .eq("date", date)
        .in("plate", part);
      if (res.error) {
        failed = res.error;
        break;
      }
      rows.push(...((res.data ?? []) as unknown as SavedRow[]));
    }
    if (!failed) {
      savedRows = rows;
      break;
    }
    if (!/checklist|tacho_reason|excluded/i.test(failed.message)) break;
  }
  if (savedRows === null) {
    dbReady = false;
  } else {
    for (const r of savedRows) {
      times.set(r.plate, r.out_time ?? null);
      if (r.checklist) checks.add(r.plate);
      const reason = (r.tacho_reason ?? "").trim();
      if (reason) tachoReasons.set(r.plate, reason);
      if (r.excluded) excludes.add(r.plate);
    }
  }

  // 모뎀불량(LTE 모뎀 교체 내역) — 배차표 버튼 상태·팝업 프리필용.
  // 테이블이 아직 없거나 조회가 실패해도 배차표 자체는 동작해야 하므로 표시만 생략한다.
  const modems = new Map<
    string,
    { kind: string; symptom: string; beforeSn: string; afterSn: string; hasPhoto: boolean }
  >();
  try {
    for (const part of chunk(plates)) {
      const res = await supabase
        .from("modem_defects")
        .select("plate, kind, symptom, before_sn, after_sn, photo_after, photo_info")
        .eq("date", date)
        .in("plate", part);
      if (res.error) break;
      for (const m of res.data ?? []) {
        modems.set(m.plate, {
          kind: m.kind ?? "",
          symptom: m.symptom ?? "",
          beforeSn: m.before_sn ?? "",
          afterSn: m.after_sn ?? "",
          hasPhoto: !!(m.photo_after || m.photo_info),
        });
      }
    }
  } catch {
    // 모뎀불량 표시는 부가 정보 — 실패해도 무시
  }

  // 설치완료 여부 — 대시보드 완료 판정과 동일(saved_at + 설치전7·설치후7 충족, fetchCompletedMap 로직)
  // 설치중 = 기록이 있고 사진(또는 '단말기 없음')을 1칸 이상 채웠지만 아직 완료 아님
  // (대시보드 진행중 판정과 동일 기준). 조회 실패해도 배차표 자체는 동작해야 하므로 표시만 생략.
  const completedSet = new Set<string>();
  const installingSet = new Set<string>();
  // 설치팀 — records.team은 "팀명 이름"으로 저장, 배차표에는 팀명만 표시
  const teamOf = new Map<string, string>();
  try {
    const stdSlots = [...BEFORE_SLOTS, ...AFTER_SLOTS].map((s) => s.slotKey);
    for (const part of chunk(plates)) {
      // 사진은 fetchAll 페이지네이션으로 — Supabase Max Rows 설정값에 의존해
      // 조용히 잘리면 일부 완료 차량의 배지가 빠진다.
      const [recRes, photoRows] = await Promise.all([
        supabase
          .from("records")
          .select("plate, saved_at, na_slots, team")
          .in("plate", part),
        fetchAll<{ plate: string; slot_key: string }>((from, to) =>
          supabase
            .from("photos")
            .select("plate, slot_key")
            .in("plate", part)
            .in("slot_key", stdSlots)
            .order("id")
            .range(from, to),
        ).catch(() => null),
      ]);
      if (recRes.error || photoRows === null) continue;
      const bySlot = new Map<string, Set<string>>();
      for (const p of photoRows) {
        const s = bySlot.get(p.plate) ?? new Set<string>();
        s.add(p.slot_key);
        bySlot.set(p.plate, s);
      }
      for (const r of recRes.data ?? []) {
        const team = String(r.team ?? "").trim().split(/\s+/)[0]; // "1팀 홍길동" → "1팀"
        if (team) teamOf.set(r.plate, team);
        const have = bySlot.get(r.plate);
        const na = new Set<string>(Array.isArray(r.na_slots) ? r.na_slots : []);
        if (r.saved_at && stdSlots.every((k) => have?.has(k) || na.has(k))) {
          completedSet.add(r.plate);
        } else if ((have?.size ?? 0) + na.size >= 1) {
          installingSet.add(r.plate);
        }
      }
    }
  } catch {
    // 완료·설치중 표시는 부가 정보 — 실패해도 무시
  }

  return NextResponse.json({
    vehicles: vehicles.map((v) => ({
      plate: v.plate,
      route: v.route ?? "",
      outTime: times.get(v.plate) ?? null,
      checklist: checks.has(v.plate),
      completed: completedSet.has(v.plate),
      installing: installingSet.has(v.plate), // 설치중(시작했으나 미완료 — 서버 판정)
      team: teamOf.get(v.plate) ?? "", // 설치팀 팀명(기록 없으면 빈값)
      // 타코 미연결 사유 — 빈 문자열이면 '타코 정상'(기본값)
      tachoReason: tachoReasons.get(v.plate) ?? "",
      excluded: excludes.has(v.plate), // 설치제외(나중에 설치 — 리스트에는 유지)
      // LTE 모뎀 교체 기록 — 없으면 null(= 모뎀 정상, 버튼 기본 상태)
      modem: modems.get(v.plate) ?? null,
    })),
    dbReady,
  });
}

export async function POST(req: NextRequest) {
  let body: {
    operator?: string;
    date?: string;
    entries?: {
      plate?: string;
      route?: string;
      outTime?: string | null;
      checklist?: boolean;
      tachoReason?: string | null;
      excluded?: boolean;
    }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const operator = (body.operator ?? "").trim().slice(0, 100);
  const date = (body.date ?? "").trim();
  const entries = Array.isArray(body.entries) ? body.entries.slice(0, 1000) : [];
  if (!operator || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "운수사와 날짜를 확인하세요." }, { status: 400 });
  }

  const now = new Date().toISOString();
  // 요청에 실제로 담긴 항목만 컬럼으로 만든다 — upsert는 보낸 컬럼만 갱신하므로,
  // 기기 A가 저장한 검수완료를 기기 B의 시간 저장이 옛 값으로 덮어쓰지 않는다.
  const rows = entries
    .map((e) => {
      const row: Record<string, unknown> = {
        operator,
        date,
        route: (e.route ?? "").trim().slice(0, 100) || null,
        plate: (e.plate ?? "").trim().slice(0, 30),
        updated_at: now,
      };
      // "HH:MM" 또는 "OFF"(휴차 체크) — 그 외 값은 미정(null)
      if ("outTime" in e) {
        row.out_time =
          typeof e.outTime === "string" && (TIME_RE.test(e.outTime) || e.outTime === "OFF")
            ? e.outTime
            : null;
      }
      if ("checklist" in e) row.checklist = e.checklist === true;
      // 사유가 비면 null — '미연결 해제(정상으로 되돌리기)'가 된다
      if ("tachoReason" in e) {
        row.tacho_reason = String(e.tachoReason ?? "").trim().slice(0, 200) || null;
      }
      if ("excluded" in e) row.excluded = e.excluded === true;
      return row;
    })
    .filter((r) => r.plate);
  if (rows.length === 0) {
    return NextResponse.json({ error: "저장할 차량이 없습니다." }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 같은 upsert 안의 행은 컬럼 구성이 같아야 하므로, 컬럼 구성별로 묶어 저장
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const key = Object.keys(r).sort().join(",");
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }

  for (const g of groups.values()) {
    let { error } = await supabase
      .from("dispatch_times")
      .upsert(g, { onConflict: "date,plate" });
    // 사유를 적어 보냈는데 컬럼이 없으면, 빼고 재시도해 '저장됨'으로 보이게 하면 안 된다 —
    // 화면엔 미연결로 남고 DB엔 없어서 리포트에서 조용히 빠진다. 실패로 알린다.
    if (
      error &&
      /tacho_reason/i.test(error.message) &&
      g.some((r) => r.tacho_reason)
    ) {
      return NextResponse.json(
        {
          error:
            "타코 미연결 사유를 저장할 DB 준비가 안 됐습니다. 관리자에게 supabase/migration_dispatch_tacho_off.sql 실행을 요청해주세요.",
        },
        { status: 500 },
      );
    }
    // 타코 사유·설치제외 컬럼 없는 DB(migration_dispatch_tacho_off.sql 전) — 빼고 재시도
    if (error && /tacho_reason|excluded/i.test(error.message)) {
      const stripped = g.map(({ tacho_reason: _t, excluded: _e, ...rest }) => rest);
      ({ error } = await supabase
        .from("dispatch_times")
        .upsert(stripped, { onConflict: "date,plate" }));
      // checklist 컬럼도 없는 더 옛 DB — 체크리스트까지 빼고 재시도(시간·휴차는 저장)
      if (error && /checklist/i.test(error.message)) {
        const noCheck = stripped.map(({ checklist: _c, ...rest }) => rest);
        ({ error } = await supabase
          .from("dispatch_times")
          .upsert(noCheck, { onConflict: "date,plate" }));
      }
    } else if (error && /checklist/i.test(error.message)) {
      const noCheck = g.map(
        ({ checklist: _c, tacho_reason: _t, excluded: _e, ...rest }) => rest,
      );
      ({ error } = await supabase
        .from("dispatch_times")
        .upsert(noCheck, { onConflict: "date,plate" }));
    }
    if (error) {
      const msg = /dispatch_times/i.test(error.message)
        ? "저장 실패 — migration_dispatch.sql 실행이 필요합니다(관리자 문의)."
        : `저장 실패: ${error.message}`;
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
