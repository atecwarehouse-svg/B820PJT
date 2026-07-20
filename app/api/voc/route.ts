import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendVocCard } from "@/lib/teams";
import { cleanRatings } from "@/lib/voc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/voc?operator=&date=YYYY-MM-DD — 이미 저장된 VOC 불러오기(폼 재진입 시 수정용).
export async function GET(req: NextRequest) {
  const operator = (req.nextUrl.searchParams.get("operator") ?? "").trim();
  const date = (req.nextUrl.searchParams.get("date") ?? "").trim();
  if (!operator || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "운수사·설치일을 확인하세요." }, { status: 400 });
  }
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("vocs")
      .select("items, day_off, notes")
      .eq("operator", operator)
      .eq("date", date)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ voc: data ?? null });
  } catch {
    // 테이블 미생성(마이그레이션 전) 등 — 불러오기만 생략
    return NextResponse.json({ voc: null });
  }
}

// POST /api/voc — 대시보드 'VOC 접수' 폼 → DB 저장(운수사+설치일 upsert) + 팀즈 알림.
// 협의사항처럼 비밀번호 없이 현장에서 바로 사용. 팀즈 카드에는 VOC 내용을 넣지 않고
// 등록 사실만 알린다(내용은 관리자 페이지에서 확인·수정).
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const operator = String(body.operator ?? "")
    .trim()
    .slice(0, 60);
  const label = String(body.label ?? "")
    .trim()
    .slice(0, 30);
  const date = String(body.date ?? "").trim();
  if (!operator) {
    return NextResponse.json({ error: "운수사를 선택하세요." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "설치일을 확인하세요." }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems.slice(0, 300).map((raw) => {
    const i = (raw ?? {}) as Record<string, unknown>;
    return {
      plate: String(i.plate ?? "").trim().slice(0, 20),
      route: String(i.route ?? "").trim().slice(0, 30) || undefined,
      ratings: cleanRatings(i.ratings),
      comment: String(i.comment ?? "").trim().slice(0, 300),
    };
  });

  const dayOff = (Array.isArray(body.dayOff) ? body.dayOff : [])
    .slice(0, 300)
    .map((p) => String(p ?? "").trim().slice(0, 20))
    .filter(Boolean);

  const notes = String(body.notes ?? "")
    .trim()
    .slice(0, 500);

  // 저장이 본체 — 실패하면 에러로 알린다(팀즈 알림은 그 다음).
  const supabase = createServiceClient();
  const { error } = await supabase.from("vocs").upsert(
    {
      operator,
      date,
      items,
      day_off: dayOff,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "operator,date" },
  );
  if (error) {
    // 테이블 미생성 — PostgREST는 "Could not find the table 'public.vocs'" 형태로도 답한다.
    const missing = /vocs/i.test(error.message) && /does not exist|could not find/i.test(error.message);
    return NextResponse.json(
      {
        error: missing
          ? "VOC 테이블이 없습니다. supabase/migration_voc.sql 을 실행하세요."
          : `저장 실패: ${error.message}`,
      },
      { status: 500 },
    );
  }

  // 팀즈 알림 — 내용 없이 등록 사실만. 실패해도 저장은 유지하고 알림만 생략.
  let notified = false;
  try {
    // 노선별 대수 — 카드 부제 "영업소 00노선 날짜 (N대)"용. 휴차 차량은 노선 정보가
    // 없으므로 평가 대상(items) 기준으로 센다.
    const byRoute = new Map<string, number>();
    for (const i of items) {
      const key = i.route ?? "";
      byRoute.set(key, (byRoute.get(key) ?? 0) + 1);
    }
    const groups = [...byRoute.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
      .map(([route, count]) => ({ route: route || undefined, count }));

    await sendVocCard({ operator, label: label || date, groups });
    notified = true;
  } catch {
    // 웹후크 미설정·전송 실패 — 저장은 완료
  }

  return NextResponse.json({ ok: true, notified });
}
