import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendConsultationCard } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/consultation?date=YYYY-MM-DD — 설치계획 보고 폼의 자동 불러오기용.
// 해당 설치일의 협의사항에서 설치장소·당일/익일 휴차만 반환(담당자 연락처 등은 제외).
export async function GET(req: NextRequest) {
  const date = (req.nextUrl.searchParams.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "날짜를 확인하세요." }, { status: 400 });
  }
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("consultations")
      .select("operator, place, day_off, next_day_off")
      .eq("date", date);
    if (error) throw error;
    return NextResponse.json({ list: data ?? [] });
  } catch {
    // 테이블 미생성(마이그레이션 전) 등 — 자동 불러오기만 생략
    return NextResponse.json({ list: [] });
  }
}

// POST /api/consultation — 대시보드 '운수사 협의사항' 폼 → 팀즈(사진 전송 채팅방) 카드 전송.
// 관리자 호출과 같이 비밀번호 없이 전송(현장에서 바로 쓰는 용도).
// 전송 성공 시 consultations 테이블에 운수사+설치일 기준 upsert(관리자 페이지에서 관리).
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const text = (key: string, max = 100) => {
    const s = String(body[key] ?? "")
      .trim()
      .slice(0, max);
    return s || undefined;
  };
  const time = (key: string) => {
    const s = String(body[key] ?? "").trim();
    return /^\d{2}:\d{2}$/.test(s) ? s : undefined;
  };

  const operator = String(body.operator ?? "")
    .trim()
    .slice(0, 50);
  const date = String(body.date ?? "").trim();
  const countNum = Number(body.count);
  const count = Number.isFinite(countNum) && countNum > 0 ? Math.floor(countNum) : 0;

  if (!operator) {
    return NextResponse.json({ error: "운수사를 선택하세요." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "설치 일정을 선택하세요." }, { status: 400 });
  }

  const card = {
    operator,
    date,
    count,
    routes: text("routes", 300),
    listCheck: text("listCheck", 20),
    listChange: text("listChange", 300),
    place: text("place"),
    workStart: time("workStart"),
    dayOff: text("dayOff"),
    nextDayOff: text("nextDayOff"),
    arrival: time("arrival"),
    nextFirstBus: time("nextFirstBus"),
    depotOut: time("depotOut"),
    keyMethod: text("keyMethod"),
    engineOn: text("engineOn", 20),
    fuel: text("fuel", 30),
    managerDay: text("managerDay"),
    managerNight: text("managerNight"),
    mountDisplay: text("mountDisplay"),
    mountMain: text("mountMain"),
    mountBoard: text("mountBoard"),
    handleRemoval: text("handleRemoval", 50),
    notes: text("notes", 500),
    consulter: text("consulter"),
  };

  try {
    await sendConsultationCard(card);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: `팀즈 전송 실패: ${msg}` }, { status: 500 });
  }

  // 전송 성공 후 DB 저장 — 같은 운수사+설치일이면 최신 내용으로 갱신.
  // 테이블 미생성(마이그레이션 전)이어도 전송은 성공이므로 저장 여부만 응답에 표시.
  let saved = false;
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("consultations").upsert(
      {
        operator: card.operator,
        date: card.date,
        count: card.count,
        routes: card.routes ?? null,
        list_check: card.listCheck ?? null,
        list_change: card.listChange ?? null,
        place: card.place ?? null,
        work_start: card.workStart ?? null,
        day_off: card.dayOff ?? null,
        next_day_off: card.nextDayOff ?? null,
        arrival: card.arrival ?? null,
        next_first_bus: card.nextFirstBus ?? null,
        depot_out: card.depotOut ?? null,
        key_method: card.keyMethod ?? null,
        engine_on: card.engineOn ?? null,
        fuel: card.fuel ?? null,
        manager_day: card.managerDay ?? null,
        manager_night: card.managerNight ?? null,
        mount_display: card.mountDisplay ?? null,
        mount_main: card.mountMain ?? null,
        mount_board: card.mountBoard ?? null,
        handle_removal: card.handleRemoval ?? null,
        notes: card.notes ?? null,
        consulter: card.consulter ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "operator,date" },
    );
    saved = !error;
  } catch {
    // 저장 실패해도 전송은 완료 — saved=false로 알림
  }

  return NextResponse.json({ ok: true, saved });
}
