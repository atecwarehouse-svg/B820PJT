import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ShareBody {
  label?: string; // 날짜 라벨 (예: "9/17 (수)")
  todayPlanned?: number;
  complete?: number;
  inProgress?: number;
  remain?: number;
}

// POST /api/teams/share  → 설치 진행 현황 카드를 Teams 채널에 전송(Incoming Webhook)
export async function POST(req: NextRequest) {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) {
    return NextResponse.json(
      { error: "팀즈 웹후크가 설정되지 않았습니다. (TEAMS_WEBHOOK_URL)" },
      { status: 500 },
    );
  }

  const b = (await req.json()) as ShareBody;
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
  const label = (b.label ?? "").toString().slice(0, 40);
  const planned = n(b.todayPlanned);
  const inProgress = n(b.inProgress);
  const complete = n(b.complete);
  const remain = n(b.remain);

  // Teams Adaptive Card (Workflows '웹후크 요청 수신 시' 호환 envelope)
  const card = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              size: "Large",
              weight: "Bolder",
              text: "🚌 B820 단말기 설치 진행 현황",
              wrap: true,
            },
            {
              type: "TextBlock",
              text: label ? `${label} 기준` : "현재 기준",
              isSubtle: true,
              spacing: "None",
              wrap: true,
            },
            {
              type: "FactSet",
              facts: [
                { title: "금일 설치계획", value: `${planned.toLocaleString()}대` },
                { title: "진행중", value: `${inProgress.toLocaleString()}대` },
                { title: "완료", value: `${complete.toLocaleString()}대` },
                { title: "잔여(설치대상)", value: `${remain.toLocaleString()}대` },
              ],
            },
          ],
        },
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Teams 응답 ${res.status} ${t.slice(0, 120)}`);
    }
  } catch (e) {
    return NextResponse.json(
      { error: "팀즈 전송 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
