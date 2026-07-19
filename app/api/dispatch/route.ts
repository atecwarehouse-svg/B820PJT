import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 배차표 — 운수사·설치일별 차량 나가는 시간(공용 저장).
// GET  ?operator=&date= : 해당일 차량 목록 + 저장된 시간 병합
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
  const { data: vehicles, error } = await supabase
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

  // 저장된 시간 — 테이블 미생성(마이그레이션 전) DB면 시간 없이 목록만 준다
  let dbReady = true;
  const times = new Map<string, string | null>();
  const saved = await supabase
    .from("dispatch_times")
    .select("plate, out_time")
    .eq("date", date)
    .range(0, 999);
  if (saved.error) {
    dbReady = false;
  } else {
    for (const r of saved.data ?? []) times.set(r.plate, r.out_time ?? null);
  }

  return NextResponse.json({
    vehicles: (vehicles ?? []).map((v) => ({
      plate: v.plate,
      route: v.route ?? "",
      outTime: times.get(v.plate) ?? null,
    })),
    dbReady,
  });
}

export async function POST(req: NextRequest) {
  let body: {
    operator?: string;
    date?: string;
    entries?: { plate?: string; route?: string; outTime?: string | null }[];
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
      updated_at: now,
    }))
    .filter((r) => r.plate);
  if (rows.length === 0) {
    return NextResponse.json({ error: "저장할 차량이 없습니다." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("dispatch_times")
    .upsert(rows, { onConflict: "date,plate" });
  if (error) {
    // 테이블 미생성(마이그레이션 전) DB — 실행 안내
    const msg = /dispatch_times/i.test(error.message)
      ? "저장 실패 — migration_dispatch.sql 실행이 필요합니다(관리자 문의)."
      : `저장 실패: ${error.message}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
