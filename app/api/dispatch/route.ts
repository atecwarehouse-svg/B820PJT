import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { BEFORE_SLOTS, AFTER_SLOTS } from "@/lib/slots";
import { isTachoCheck } from "@/lib/tacho";

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
  // tacho(타코 제조사) 컬럼 없는 DB(migration_tacho.sql 미실행)면 빼고 재시도(타코확인 표시만 생략)
  type VehicleRow = { plate: string; route: string | null; tacho?: string | null };
  const selectVehicles = (cols: string) =>
    supabase
      .from("vehicles")
      .select(cols)
      .eq("operator", operator)
      .eq("planned_date", date)
      .order("route")
      .order("plate")
      .range(0, 999);
  let { data, error } = await selectVehicles("plate, route, tacho");
  if (error && /tacho/i.test(error.message)) {
    ({ data, error } = await selectVehicles("plate, route"));
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const vehicles = (data ?? []) as unknown as VehicleRow[];
  const plates = vehicles.map((v) => v.plate);

  // 저장된 시간·체크리스트·타코확인·설치제외 — 없는 컬럼(마이그레이션 전)은 단계적으로 빼고 재시도
  let dbReady = true;
  const times = new Map<string, string | null>();
  const checks = new Set<string>();
  const tachoDones = new Set<string>();
  const excludes = new Set<string>();
  type SavedRow = {
    plate: string;
    out_time: string | null;
    checklist?: boolean;
    tacho_checked?: boolean;
    excluded?: boolean;
  };
  let savedRows: SavedRow[] | null = null;
  const SELECTS = [
    "plate, out_time, checklist, tacho_checked, excluded",
    "plate, out_time, checklist",
    "plate, out_time",
  ];
  for (const cols of SELECTS) {
    const res = await supabase
      .from("dispatch_times")
      .select(cols)
      .eq("date", date)
      .range(0, 999);
    if (!res.error) {
      savedRows = (res.data ?? []) as unknown as SavedRow[];
      break;
    }
    if (!/checklist|tacho_checked|excluded/i.test(res.error.message)) break;
  }
  if (savedRows === null) {
    dbReady = false;
  } else {
    for (const r of savedRows) {
      times.set(r.plate, r.out_time ?? null);
      if (r.checklist) checks.add(r.plate);
      if (r.tacho_checked) tachoDones.add(r.plate);
      if (r.excluded) excludes.add(r.plate);
    }
  }

  // 설치완료 여부 — 대시보드 완료 판정과 동일(saved_at + 설치전7·설치후7 충족, fetchCompletedMap 로직)
  // 조회 실패해도 배차표 자체는 동작해야 하므로 완료 표시만 생략한다.
  const completedSet = new Set<string>();
  try {
    const stdSlots = [...BEFORE_SLOTS, ...AFTER_SLOTS].map((s) => s.slotKey);
    const CH = 100; // 한글 plate 다수 in() 필터는 URL 길이 초과 방지를 위해 분할
    for (let i = 0; i < plates.length; i += CH) {
      const chunk = plates.slice(i, i + CH);
      // 사진은 fetchAll 페이지네이션으로 — Supabase Max Rows 설정값에 의존해
      // 조용히 잘리면 일부 완료 차량의 배지가 빠진다.
      const [recRes, photoRows] = await Promise.all([
        supabase
          .from("records")
          .select("plate, saved_at, na_slots")
          .in("plate", chunk)
          .not("saved_at", "is", null),
        fetchAll<{ plate: string; slot_key: string }>((from, to) =>
          supabase
            .from("photos")
            .select("plate, slot_key")
            .in("plate", chunk)
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
        const have = bySlot.get(r.plate);
        const na = new Set<string>(Array.isArray(r.na_slots) ? r.na_slots : []);
        if (stdSlots.every((k) => have?.has(k) || na.has(k))) completedSet.add(r.plate);
      }
    }
  } catch {
    // 완료 표시는 부가 정보 — 실패해도 무시
  }

  return NextResponse.json({
    vehicles: vehicles.map((v) => ({
      plate: v.plate,
      route: v.route ?? "",
      outTime: times.get(v.plate) ?? null,
      checklist: checks.has(v.plate),
      completed: completedSet.has(v.plate),
      tachoCheck: isTachoCheck(v.tacho), // 조영 DT-202 → 배차표에 '타코확인' 표시
      tachoDone: tachoDones.has(v.plate), // 타코확인 완료(체크 시 녹색)
      excluded: excludes.has(v.plate), // 설치제외(나중에 설치 — 리스트에는 유지)
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
      tachoDone?: boolean;
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
  const rows = entries
    .map((e) => ({
      operator,
      date,
      route: (e.route ?? "").trim().slice(0, 100) || null,
      plate: (e.plate ?? "").trim().slice(0, 30),
      // "HH:MM" 또는 "OFF"(휴차 체크) — 그 외 값은 미정(null)
      out_time:
        typeof e.outTime === "string" && (TIME_RE.test(e.outTime) || e.outTime === "OFF")
          ? e.outTime
          : null,
      checklist: e.checklist === true,
      tacho_checked: e.tachoDone === true,
      excluded: e.excluded === true,
      updated_at: now,
    }))
    .filter((r) => r.plate);
  if (rows.length === 0) {
    return NextResponse.json({ error: "저장할 차량이 없습니다." }, { status: 400 });
  }

  const supabase = createServiceClient();
  let { error } = await supabase
    .from("dispatch_times")
    .upsert(rows, { onConflict: "date,plate" });
  // 타코확인·설치제외 컬럼 없는 DB(migration_dispatch_tacho_excl.sql 전) — 빼고 재시도
  if (error && /tacho_checked|excluded/i.test(error.message)) {
    const stripped = rows.map(({ tacho_checked: _t, excluded: _e, ...rest }) => rest);
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
    const noCheck = rows.map(({ checklist: _c, tacho_checked: _t, excluded: _e, ...rest }) => rest);
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

  return NextResponse.json({ ok: true });
}
