import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendConsultationCard } from "@/lib/teams";
import { getConsultConfig } from "@/lib/settings";
import { CONSULT_META, childVisible } from "@/lib/consultation-form";

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
      .select("operator, place, day_off, next_day_off, notes")
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
// 본문: { operator, date, count, routes, values: {항목키(컬럼명): 값} } — 항목은 프로젝트 양식(consult_form)으로 걸러 받는다.
// 전송 성공 시 consultations 테이블에 운수사+설치일 기준 upsert(관리자 페이지에서 관리).
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const operator = String(body.operator ?? "")
    .trim()
    .slice(0, 50);
  const date = String(body.date ?? "").trim();
  const countNum = Number(body.count);
  const count =
    Number.isFinite(countNum) && countNum > 0 ? Math.floor(countNum) : 0;

  if (!operator) {
    return NextResponse.json(
      { error: "운수사를 선택하세요." },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "설치 일정을 선택하세요." },
      { status: 400 },
    );
  }

  const fields = await getConsultConfig();
  const raw = (body.values && typeof body.values === "object" ? body.values : {}) as Record<string, unknown>;
  // 양식에 켜진 항목만 받는다 — 꺼진 항목·숨겨진 종속 항목(예: 동시출발 '해당없음'의 사전출발)은 비움
  const values: Record<string, string | undefined> = {};
  for (const f of fields) {
    if (f.type === "heading" || !f.enabled) continue;
    const s = String(raw[f.key] ?? "").trim();
    if (f.type === "time") {
      values[f.key] = /^\d{2}:\d{2}$/.test(s) ? s : undefined;
    } else {
      const cut = s.slice(0, CONSULT_META[f.key]?.max ?? 100);
      values[f.key] = cut || undefined;
    }
  }
  for (const f of fields) {
    if (!childVisible(f.key, fields, values)) values[f.key] = undefined;
  }
  const routes = String(body.routes ?? "").trim().slice(0, 300) || undefined;

  try {
    await sendConsultationCard({ operator, date, count, routes, values }, fields);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json(
      { error: `팀즈 전송 실패: ${msg}` },
      { status: 500 },
    );
  }

  // 전송 성공 후 DB 저장 — 같은 운수사+설치일이면 최신 내용으로 갱신.
  // 테이블 미생성(마이그레이션 전)이어도 전송은 성공이므로 저장 여부만 응답에 표시.
  let saved = false;
  try {
    const supabase = createServiceClient();
    const row: Record<string, unknown> = {
      operator,
      date,
      count,
      routes: routes ?? null,
      updated_at: new Date().toISOString(),
    };
    // 양식 항목 키 = 컬럼명. 꺼진 항목도 null 로 써서 이전 전송값이 남지 않게 한다
    for (const f of fields) if (f.type !== "heading") row[f.key] = values[f.key] ?? null;
    let { error } = await supabase
      .from("consultations")
      .upsert(row, { onConflict: "operator,date" });
    // 나중에 추가된 컬럼(마이그레이션 전 DB) — 그 컬럼만 빼고 재시도(기존 항목 저장은 유지)
    const OPTIONAL_COLS = [
      "terminal_storage",
      "simul_start",
      "early_plates",
      "mount_alight",
    ];
    while (error) {
      const msg = error.message;
      const col = OPTIONAL_COLS.find((c) => c in row && msg.includes(c));
      if (!col) break;
      delete row[col];
      ({ error } = await supabase
        .from("consultations")
        .upsert(row, { onConflict: "operator,date" }));
    }
    saved = !error;
  } catch {
    // 저장 실패해도 전송은 완료 — saved=false로 알림
  }

  return NextResponse.json({ ok: true, saved });
}
