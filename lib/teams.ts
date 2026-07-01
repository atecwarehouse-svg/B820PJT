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

// 설치 시작(설치전 6장 업로드 완료) 시 보내는 카드. 완료 카드와 같은 채팅방.
export async function sendStartCard(d: {
  operator: string;
  plate: string;
  route?: string;
  team?: string;
}): Promise<void> {
  const url = process.env.TEAMS_COMPLETE_WEBHOOK_URL;
  if (!url) return;

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
              text: "🚧 설치 시작",
              wrap: true,
            },
            {
              type: "TextBlock",
              size: "Medium",
              weight: "Bolder",
              text: `${d.operator} ${d.plate}`.trim(),
              spacing: "None",
              wrap: true,
            },
            ...(d.team
              ? [
                  {
                    type: "TextBlock",
                    text: `설치팀 ${d.team}`,
                    weight: "Bolder",
                    color: "Accent",
                    spacing: "None",
                    wrap: true,
                  },
                ]
              : []),
            ...(d.route
              ? [
                  {
                    type: "TextBlock",
                    text: `노선 ${d.route}`,
                    isSubtle: true,
                    spacing: "None",
                    wrap: true,
                  },
                ]
              : []),
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
    throw new Error(`Teams 시작카드 응답 ${res.status} ${t.slice(0, 160)}`);
  }
}

// 설치 완료(사진 13장 업로드) 시 별도 채팅방으로 보내는 카드.
// 웹후크: TEAMS_COMPLETE_WEBHOOK_URL (진행현황 카드와 다른 채팅방). 미설정 시 조용히 건너뜀.
// photos: 공개 HTTPS 절대 URL(앱 /api/photo/...) — Teams가 직접 받아 렌더링(데이터URI 미지원).
export async function sendCompletionCard(d: {
  operator: string;
  plate: string;
  route?: string;
  team?: string;
  photos?: { url: string; label: string }[];
}): Promise<void> {
  const url = process.env.TEAMS_COMPLETE_WEBHOOK_URL;
  if (!url) return; // 웹후크 미설정 → 발송 생략

  const photos = d.photos ?? [];
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
              text: "✅ 설치 완료",
              wrap: true,
            },
            {
              type: "TextBlock",
              size: "Medium",
              weight: "Bolder",
              text: `${d.operator} ${d.plate}`.trim(),
              spacing: "None",
              wrap: true,
            },
            ...(d.team
              ? [
                  {
                    type: "TextBlock",
                    text: `설치팀 ${d.team}`,
                    weight: "Bolder",
                    color: "Accent",
                    spacing: "None",
                    wrap: true,
                  },
                ]
              : []),
            ...(d.route
              ? [
                  {
                    type: "TextBlock",
                    text: `노선 ${d.route}`,
                    isSubtle: true,
                    spacing: "None",
                    wrap: true,
                  },
                ]
              : []),
            ...(photos.length
              ? [
                  {
                    type: "TextBlock",
                    text: `사진 ${photos.length}장`,
                    isSubtle: true,
                    spacing: "Small",
                    wrap: true,
                  },
                  {
                    type: "ImageSet",
                    imageSize: "medium",
                    images: photos.map((p) => ({
                      type: "Image",
                      url: p.url,
                      altText: p.label,
                    })),
                  },
                ]
              : []),
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
    throw new Error(`Teams 완료카드 응답 ${res.status} ${t.slice(0, 160)}`);
  }
}
