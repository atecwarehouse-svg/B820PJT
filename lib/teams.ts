// 팀즈 설치 진행 현황 카드 전송 — 공유 버튼/크론이 공유하는 로직.

export interface ProgressCardData {
  label: string; // 날짜 라벨 (예: "9/17 (수)")
  todayPlanned: number;
  inProgress: number;
  complete: number;
  remain: number;
}

export async function sendProgressCard(d: ProgressCardData): Promise<void> {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) throw new Error("팀즈 웹후크가 설정되지 않았습니다. (TEAMS_WEBHOOK_URL)");

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
              text: d.label ? `${d.label} 기준` : "현재 기준",
              isSubtle: true,
              spacing: "None",
              wrap: true,
            },
            {
              type: "FactSet",
              facts: [
                { title: "금일 설치계획", value: `${d.todayPlanned.toLocaleString()}대` },
                { title: "진행중", value: `${d.inProgress.toLocaleString()}대` },
                { title: "완료", value: `${d.complete.toLocaleString()}대` },
                { title: "잔여(설치대상)", value: `${d.remain.toLocaleString()}대` },
              ],
            },
          ],
        },
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Teams 응답 ${res.status} ${t.slice(0, 160)}`);
  }
}
