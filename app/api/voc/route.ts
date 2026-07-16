import { NextRequest, NextResponse } from "next/server";
import { sendVocCard } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/voc — 대시보드 '운수사 VOC' 폼 → 팀즈(설치 진행중 공유방) 카드 전송.
// 협의사항·운행시작 보고처럼 비밀번호 없이 현장에서 바로 사용. DB 저장은 하지 않음.
// 금일 휴차로 체크된 차량은 클라이언트에서 items에서 빠지고 dayOff로만 넘어온다.
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
  if (!operator) {
    return NextResponse.json({ error: "운수사를 선택하세요." }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems.slice(0, 300).map((raw) => {
    const i = (raw ?? {}) as Record<string, unknown>;
    return {
      plate: String(i.plate ?? "").trim().slice(0, 20),
      route: String(i.route ?? "").trim().slice(0, 30) || undefined,
      voc: String(i.voc ?? "").trim().slice(0, 300),
    };
  });

  const dayOff = (Array.isArray(body.dayOff) ? body.dayOff : [])
    .slice(0, 300)
    .map((p) => String(p ?? "").trim().slice(0, 20))
    .filter(Boolean);

  const notes = String(body.notes ?? "")
    .trim()
    .slice(0, 500);

  try {
    await sendVocCard({ operator, label, items, dayOff, notes: notes || undefined });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: `팀즈 전송 실패: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
