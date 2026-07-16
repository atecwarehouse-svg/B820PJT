import { NextRequest, NextResponse } from "next/server";
import { sendServiceStartCard } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/service-start — 대시보드 '운행시작 보고' 폼 → 팀즈(설치 진행중 공유방) 카드 전송.
// 관리자 호출·시작보고처럼 비밀번호 없이 현장에서 바로 사용. DB 저장은 하지 않음.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const bool = (key: string) => body[key] === true;
  // 상태값 정규화 — "ok"(이상없음)/"issue"(이상)만 허용, 그 외는 미선택
  const status = (key: string) => {
    const s = String(body[key] ?? "").trim();
    return s === "ok" || s === "issue" ? s : undefined;
  };
  const short = (key: string) =>
    String(body[key] ?? "")
      .trim()
      .slice(0, 200) || undefined;

  const baseFare = String(body.baseFare ?? "")
    .trim()
    .slice(0, 30);
  const notes = String(body.notes ?? "")
    .trim()
    .slice(0, 500);

  try {
    await sendServiceStartCard({
      driverEdu: bool("driverEdu"),
      fareSetting: bool("fareSetting"),
      baseFare: baseFare || undefined,
      bisStatus: status("bisStatus"),
      bisSymptom: short("bisSymptom"),
      kakaoStatus: status("kakaoStatus"),
      kakaoSymptom: short("kakaoSymptom"),
      notes: notes || undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: `팀즈 전송 실패: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
