import { NextRequest, NextResponse } from "next/server";
import { sendConsultationCard } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/consultation — 대시보드 '운수사 협의사항' 폼 → 팀즈(사진 전송 채팅방) 카드 전송.
// 관리자 호출과 같이 비밀번호 없이 전송(현장에서 바로 쓰는 용도).
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

  try {
    await sendConsultationCard({
      operator,
      date,
      count,
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
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: `팀즈 전송 실패: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
