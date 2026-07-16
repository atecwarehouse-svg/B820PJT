// 팀즈 설치 진행 현황 카드 전송 — 공유 버튼/크론이 공유하는 로직.

import type { DailyReport, ServiceCheck } from "./report";
import { serviceCheckRows } from "./report";

export interface ProgressCardData {
  label: string; // 날짜 라벨 (예: "9/17 (수)")
  todayPlanned: number;
  inProgress: number;
  todayDone: number; // 금일 완료 (저장 + 설치 전·후 사진 전부 충족, 현재 업무일)
  complete: number; // 누적 완료
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
                { title: "금일완료", value: `${d.todayDone.toLocaleString()}대` },
                { title: "누적완료", value: `${d.complete.toLocaleString()}대` },
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

// 설치 시작 보고 카드 — 진행현황 카드와 같은 채팅방(설치 진행중 공유방, TEAMS_WEBHOOK_URL).
// 대시보드 '설치시작 보고' 버튼에서 금일 작업 시작을 알릴 때 사용.
// groups: 금일 설치계획을 운수사·노선별로 나눈 목록 (예: "삼환교통 42노선 : 5대").
export async function sendStartReportCard(d: {
  label: string; // 날짜 라벨 (예: "9/17 (수)")
  todayPlanned: number;
  complete: number;
  remain: number;
  groups: { operator: string; route: string; planned: number }[];
}): Promise<void> {
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
              text: "B820 단말기 설치 시작 보고",
              wrap: true,
            },
            {
              type: "TextBlock",
              text: d.label ? `${d.label} 설치 시작` : "금일 설치 시작",
              isSubtle: true,
              spacing: "None",
              wrap: true,
            },
            {
              type: "TextBlock",
              weight: "Bolder",
              text: `금일 설치계획 ${d.todayPlanned.toLocaleString()}대`,
              wrap: true,
            },
            ...(d.groups.length
              ? [
                  {
                    type: "FactSet",
                    spacing: "Small",
                    facts: d.groups.map((g) => ({
                      title: `· ${g.operator}${g.route ? ` ${g.route}노선` : ""}`,
                      value: `${g.planned.toLocaleString()}대`,
                    })),
                  },
                ]
              : []),
            {
              type: "FactSet",
              facts: [
                { title: "누적 완료", value: `${d.complete.toLocaleString()}대` },
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
    throw new Error(`Teams 시작보고 응답 ${res.status} ${t.slice(0, 160)}`);
  }
}

// 금일 설치 완료 보고 카드 — 진행현황·설치시작 보고 카드와 같은 채팅방(설치 진행중 공유방, TEAMS_WEBHOOK_URL).
// 금일 완료 리포트 메일 발송 시 함께 전송. 내용은 메일 카드(formatReportText)와 동일 구성.
export async function sendCompletionReportCard(
  r: DailyReport,
  notes: string,
  check?: ServiceCheck,
): Promise<void> {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) throw new Error("팀즈 웹후크가 설정되지 않았습니다. (TEAMS_WEBHOOK_URL)");

  const noteText = notes.trim()
    ? notes
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => (l.startsWith("-") ? l : `- ${l}`))
        .join("\n")
    : "- 없음";

  // 운행시작 점검 섹션 (있을 때만) — 특이사항 위에 표기
  const checkRows = serviceCheckRows(check);
  const checkBlocks: unknown[] = checkRows.length
    ? [
        {
          type: "TextBlock",
          weight: "Bolder",
          text: "○ 운행시작 점검",
          spacing: "Small",
          wrap: true,
        },
        {
          type: "FactSet",
          spacing: "Small",
          facts: checkRows.map((row) => ({ title: row.title, value: row.value })),
        },
      ]
    : [];

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
              text: "✅ B820 단말기 설치 완료 보고",
              wrap: true,
            },
            {
              type: "TextBlock",
              text: `${r.label} (${r.dow}) 설치 완료`,
              isSubtle: true,
              spacing: "None",
              wrap: true,
            },
            {
              type: "TextBlock",
              weight: "Bolder",
              text: `금일 설치 수량 (실적/계획): ${r.dailyDone.toLocaleString()}대 / ${r.dailyPlanned.toLocaleString()}대 (${r.dailyPct.toFixed(1)}%)`,
              wrap: true,
            },
            ...(r.groups.length
              ? [
                  {
                    type: "FactSet",
                    spacing: "Small",
                    facts: r.groups.map((g) => ({
                      title: `· ${g.operator}${g.route ? ` ${g.route}노선` : ""}`,
                      value: `${g.count.toLocaleString()}대`,
                    })),
                  },
                ]
              : []),
            {
              type: "FactSet",
              facts: [
                { title: "누적 계획", value: `${r.cumPlanned.toLocaleString()}대` },
                {
                  title: "누적 완료",
                  value: `${r.cumDone.toLocaleString()}대 (${r.cumPct.toFixed(1)}%)`,
                },
                { title: "잔여", value: `${r.remaining.toLocaleString()}대` },
              ],
            },
            ...checkBlocks,
            {
              type: "TextBlock",
              weight: "Bolder",
              text: "○ 특이사항",
              spacing: "Small",
              wrap: true,
            },
            {
              type: "TextBlock",
              text: noteText,
              spacing: "None",
              wrap: true,
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
    throw new Error(`Teams 완료보고 응답 ${res.status} ${t.slice(0, 160)}`);
  }
}

// 특이사항 텍스트 → 카드 표기용 불릿 목록 (빈 값이면 "- 없음")
function bulletText(notes?: string): string {
  const s = notes?.trim();
  if (!s) return "- 없음";
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith("-") ? l : `- ${l}`))
    .join("\n");
}

// 첫 운행시작 전 점검사항 공유 카드 — 설치 진행중 공유방(TEAMS_WEBHOOK_URL).
// 금일완료 리포트의 운행시작 점검과 같은 ServiceCheck·serviceCheckRows를 쓴다.
export async function sendServiceStartCard(d: {
  check: ServiceCheck;
  notes?: string;
}): Promise<void> {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) throw new Error("팀즈 웹후크가 설정되지 않았습니다. (TEAMS_WEBHOOK_URL)");

  const rows = serviceCheckRows(d.check);
  // 이상 항목 증상은 카드 하단에 붉게 별도 표기
  const issues: string[] = [];
  if (d.check.bisStatus === "issue") {
    issues.push(`- BIS(인천): ${d.check.bisSymptom?.trim() || "증상 미기재"}`);
  }
  if (d.check.kakaoStatus === "issue") {
    issues.push(`- 카카오(초정밀): ${d.check.kakaoSymptom?.trim() || "증상 미기재"}`);
  }
  const reportedAt = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  });

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
              text: "첫 운행시작 전 점검사항 공유",
              wrap: true,
            },
            {
              type: "TextBlock",
              text: `${reportedAt} 점검`,
              isSubtle: true,
              spacing: "None",
              wrap: true,
            },
            ...(rows.length
              ? [{ type: "FactSet", facts: rows.map((r) => ({ title: r.title, value: r.value })) }]
              : []),
            {
              type: "TextBlock",
              text: "※ 기본요금은 버스 문에 붙어있는 요금과 동일한지 확인",
              isSubtle: true,
              size: "Small",
              spacing: "None",
              wrap: true,
            },
            ...(issues.length
              ? [
                  {
                    type: "TextBlock",
                    weight: "Bolder",
                    color: "Attention",
                    text: "○ 이상 증상",
                    spacing: "Medium",
                    wrap: true,
                  },
                  {
                    type: "TextBlock",
                    color: "Attention",
                    text: issues.join("\n"),
                    spacing: "None",
                    wrap: true,
                  },
                ]
              : []),
            {
              type: "TextBlock",
              weight: "Bolder",
              text: "○ 특이사항",
              spacing: "Medium",
              wrap: true,
            },
            { type: "TextBlock", text: bulletText(d.notes), spacing: "None", wrap: true },
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
    throw new Error(`Teams 운행시작 응답 ${res.status} ${t.slice(0, 160)}`);
  }
}

// 운수사 VOC 카드 — 설치 진행중 공유방(TEAMS_WEBHOOK_URL).
// 차량별 VOC를 표기하고, 금일 휴차로 체크된 차량은 내용에서 제외한다.
export interface VocCardData {
  operator: string;
  label: string; // 설치일 라벨 (예: "7/16 (목)")
  items: { plate: string; route?: string; voc: string }[]; // 휴차 제외된 차량만
  dayOff: string[]; // 금일 휴차 차량번호
  notes?: string; // 전체 특이사항
}

export async function sendVocCard(d: VocCardData): Promise<void> {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) throw new Error("팀즈 웹후크가 설정되지 않았습니다. (TEAMS_WEBHOOK_URL)");

  const withVoc = d.items.filter((i) => i.voc.trim());
  const total = d.items.length + d.dayOff.length; // 설치 대수 = VOC 대상 + 휴차

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
              text: "📣 운수사 VOC",
              wrap: true,
            },
            {
              type: "TextBlock",
              text: `${d.operator} · ${d.label} 설치 ${total.toLocaleString()}대`,
              isSubtle: true,
              spacing: "None",
              wrap: true,
            },
            {
              type: "TextBlock",
              weight: "Bolder",
              text: `○ 차량별 VOC (${withVoc.length.toLocaleString()}건)`,
              spacing: "Medium",
              wrap: true,
            },
            withVoc.length
              ? {
                  type: "FactSet",
                  spacing: "Small",
                  facts: withVoc.map((i) => ({
                    title: i.route ? `${i.plate} (${i.route})` : i.plate,
                    value: i.voc.trim(),
                  })),
                }
              : { type: "TextBlock", text: "- 접수된 VOC 없음", spacing: "None", wrap: true },
            ...(d.dayOff.length
              ? [
                  {
                    type: "TextBlock",
                    weight: "Bolder",
                    text: "○ 금일 휴차",
                    spacing: "Medium",
                    wrap: true,
                  },
                  {
                    type: "TextBlock",
                    text: d.dayOff.join(", "),
                    spacing: "None",
                    wrap: true,
                  },
                ]
              : []),
            ...(d.notes?.trim()
              ? [
                  {
                    type: "TextBlock",
                    weight: "Bolder",
                    text: "○ 특이사항",
                    spacing: "Medium",
                    wrap: true,
                  },
                  { type: "TextBlock", text: bulletText(d.notes), spacing: "None", wrap: true },
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
    throw new Error(`Teams VOC 응답 ${res.status} ${t.slice(0, 160)}`);
  }
}

// 차량이상 비고·특이사항 블록 — 설치 시작/완료 카드가 공유.
// 차량이상 비고는 결함 알림이므로 붉은색(Attention)으로 강조.
function noteBlocks(d: { checkNote?: string; extraNote?: string }): unknown[] {
  const blocks: unknown[] = [];
  if (d.checkNote?.trim()) {
    blocks.push(
      {
        type: "TextBlock",
        weight: "Bolder",
        color: "Attention",
        text: "○ 차량이상 비고",
        spacing: "Small",
        wrap: true,
      },
      {
        type: "TextBlock",
        color: "Attention",
        text: d.checkNote.trim(),
        spacing: "None",
        wrap: true,
      },
    );
  }
  if (d.extraNote?.trim()) {
    blocks.push(
      {
        type: "TextBlock",
        weight: "Bolder",
        text: "○ 특이사항",
        spacing: "Small",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: d.extraNote.trim(),
        spacing: "None",
        wrap: true,
      },
    );
  }
  return blocks;
}

// 설치 시작(설치전 7장 + 차량이상유무 8종 충족) 시 보내는 카드. 완료 카드와 같은 채팅방.
export async function sendStartCard(d: {
  operator: string;
  plate: string;
  route?: string;
  team?: string;
  checkNote?: string; // 차량이상 비고 (records.check_note)
  extraNote?: string; // 특이사항 (records.extra_note)
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
            ...noteBlocks(d),
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

// 현장에서 "관리자 호출" 버튼을 눌렀을 때 보내는 카드.
// 웹후크: TEAMS_ADMIN_CALL_WEBHOOK_URL (진행현황·설치완료와 또 다른 채팅방).
// 미설정 시 throw — 호출이 목적이므로 조용히 생략하면 안 되고 사용자에게 실패를 알려야 함.
export async function sendAdminCallCard(d: {
  team: string;
  plate: string;
  operator?: string;
  route?: string;
  reason: string;
  memo?: string;
}): Promise<void> {
  const url = process.env.TEAMS_ADMIN_CALL_WEBHOOK_URL;
  if (!url) {
    throw new Error(
      "관리자 호출 웹후크가 설정되지 않았습니다. 관리자에게 문의하세요. (TEAMS_ADMIN_CALL_WEBHOOK_URL)",
    );
  }

  const calledAt = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

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
              color: "Attention",
              text: "🚨 관리자 호출",
              wrap: true,
            },
            {
              type: "TextBlock",
              size: "Medium",
              weight: "Bolder",
              color: "Accent",
              text: `설치팀 ${d.team}`,
              spacing: "None",
              wrap: true,
            },
            {
              type: "FactSet",
              facts: [
                { title: "차량번호", value: d.plate },
                ...(d.operator ? [{ title: "운수사", value: d.operator }] : []),
                ...(d.route ? [{ title: "노선", value: d.route }] : []),
                { title: "호출 사유", value: d.reason },
                { title: "호출 시각", value: calledAt },
              ],
            },
            ...(d.memo
              ? [
                  {
                    type: "TextBlock",
                    text: `📝 ${d.memo}`,
                    isSubtle: true,
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
    throw new Error(`Teams 호출카드 응답 ${res.status} ${t.slice(0, 160)}`);
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
  checkNote?: string; // 차량이상 비고 (records.check_note)
  extraNote?: string; // 특이사항 (records.extra_note)
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
            ...noteBlocks(d),
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

export interface ConsultationCardData {
  operator: string; // 1. 운수사
  date: string; // 설치 일정 (YYYY-MM-DD)
  count: number; // 2. 설치 대수
  routes?: string; // 그날 설치 노선별 대수 (예: "M6628 3대 · 9500 2대")
  listCheck?: string; // 차량리스트·수량 확인 (이상 없음/변동 있음)
  listChange?: string; // 변동사항
  place?: string; // 3. 설치 장소
  workStart?: string; // 4. 작업 시간 — 첫차 운행 종료 "HH:MM"
  dayOff?: string; // 5. 당일 휴차
  nextDayOff?: string; // 6. 익일 휴차
  arrival?: string; // 7. 첫차 운행 종료 후 도착 예정 "HH:MM"
  nextFirstBus?: string; // 8. 익일 첫차 출발 "HH:MM"
  depotOut?: string; // 9. 차고지에서 나가는 시간(첫차 기준) "HH:MM"
  keyMethod?: string; // 10. 차키 협조
  engineOn?: string; // 11. 작업 중 차량 시동 가능 여부
  fuel?: string; // 12. 충전 여부
  managerDay?: string; // 13. 운수사 담당자(주간)
  managerNight?: string; // 13. 운수사 담당자(야간)
  mountDisplay?: string; // 14. 표출기
  mountMain?: string; // 14. 통합단말기
  mountBoard?: string; // 14. 승차
  handleRemoval?: string; // 14. 격벽 손잡이(얇은봉) 탈거 유무
  notes?: string; // 15. 특이사항
  consulter?: string; // 16. 협의자
}

// 운수사 협의사항 카드 — 대시보드 '운수사 협의사항' 폼에서 전송.
// 웹후크: TEAMS_COMPLETE_WEBHOOK_URL (설치완료 사진과 같은 채팅방).
// 사용자가 명시적으로 보내는 것이므로 미설정 시 throw해 실패를 알린다.
export async function sendConsultationCard(d: ConsultationCardData): Promise<void> {
  const url = process.env.TEAMS_COMPLETE_WEBHOOK_URL;
  if (!url) {
    throw new Error(
      "협의사항 웹후크가 설정되지 않았습니다. 관리자에게 문의하세요. (TEAMS_COMPLETE_WEBHOOK_URL)",
    );
  }

  // 미입력 항목은 "-" 표기 — 아직 협의되지 않은 항목이 카드에서 바로 보이게.
  const v = (s?: string) => s?.trim() || "-";
  const dateDot = d.date.replace(/-/g, ".");
  const sub = (text: string) => ({
    type: "TextBlock",
    weight: "Bolder",
    text,
    spacing: "Medium",
    wrap: true,
  });

  const noteText = d.notes?.trim()
    ? d.notes
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => (l.startsWith("-") ? l : `- ${l}`))
        .join("\n")
    : "- 없음";

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
              text: `📋 [${dateDot} 설치 일정] 운수사 협의사항`,
              wrap: true,
            },
            {
              type: "TextBlock",
              size: "Medium",
              weight: "Bolder",
              color: "Accent",
              text: `${d.operator} · ${d.count}대`,
              spacing: "None",
              wrap: true,
            },
            {
              type: "FactSet",
              facts: [
                { title: "운수사", value: d.operator },
                { title: "설치 대수", value: `${d.count}대` },
                { title: "설치 노선", value: v(d.routes) },
                { title: "차량리스트 확인", value: v(d.listCheck) },
                ...(d.listChange?.trim()
                  ? [{ title: "변동사항", value: d.listChange.trim() }]
                  : []),
                { title: "설치 장소", value: v(d.place) },
                {
                  title: "작업 시간",
                  value: d.workStart ? `${d.workStart} 이후부터 가능` : "-",
                },
                { title: "당일 휴차", value: v(d.dayOff) },
                { title: "익일 휴차", value: v(d.nextDayOff) },
              ],
            },
            sub("○ 차량 운행 시간"),
            {
              type: "FactSet",
              spacing: "Small",
              facts: [
                { title: "첫차 종료 후 도착", value: v(d.arrival) },
                { title: "익일 첫차 출발", value: v(d.nextFirstBus) },
                { title: "차고지 출발(첫차)", value: v(d.depotOut) },
              ],
            },
            sub("○ 협조·확인사항"),
            {
              type: "FactSet",
              spacing: "Small",
              facts: [
                { title: "차키 협조", value: v(d.keyMethod) },
                { title: "작업 중 시동", value: v(d.engineOn) },
                { title: "충전 여부", value: v(d.fuel) },
              ],
            },
            sub("○ 담당자·단말기 설치 위치"),
            {
              type: "FactSet",
              spacing: "Small",
              facts: [
                { title: "담당자(주간)", value: v(d.managerDay) },
                { title: "담당자(야간)", value: v(d.managerNight) },
                { title: "표출기", value: v(d.mountDisplay) },
                { title: "통합단말기", value: v(d.mountMain) },
                { title: "승차", value: v(d.mountBoard) },
                { title: "격벽 손잡이 탈거", value: v(d.handleRemoval) },
              ],
            },
            sub("○ 특이사항"),
            {
              type: "TextBlock",
              text: noteText,
              spacing: "None",
              wrap: true,
            },
            {
              type: "FactSet",
              facts: [{ title: "협의자", value: v(d.consulter) }],
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
    throw new Error(`Teams 협의사항카드 응답 ${res.status} ${t.slice(0, 160)}`);
  }
}

export interface PlanReportGroup {
  operator: string;
  routes: { route: string; count: number }[]; // 노선별 대수
  count: number; // 운수사 합계
  time?: string; // 집합시간 "HH:MM" (24시간)
  place?: string; // 설치 장소
  dayOff?: string; // 당일 휴차 (협의사항방 카드에만 표시)
  nextDayOff?: string; // 익일 휴차 (협의사항방 카드에만 표시)
  // 아래는 협의사항방 카드 전용 — consultations 저장 데이터에서 서버가 채움
  arrival?: string; // 첫차 종료 후 도착 예정
  keyMethod?: string; // 차키 협조
  engineOn?: string; // 작업 중 시동
  fuel?: string; // 충전 여부
  mountDisplay?: string; // 표출기
  mountMain?: string; // 통합단말기
  mountBoard?: string; // 승차
  handleRemoval?: string; // 격벽 손잡이 탈거
  notes?: string; // 특이사항
}

// 설치계획 보고 카드 — 대시보드 '설치계획 보고' 버튼. 채팅방별로 내용이 다르다:
//   시작보고 채팅방(TEAMS_WEBHOOK_URL): 노선·집합시간·설치 장소만 (휴차 없음)
//   협의사항 채팅방(TEAMS_COMPLETE_WEBHOOK_URL): + 휴차·도착시간·협조확인·설치위치·특이사항
// 둘 중 하나라도 미설정이면 throw(사용자가 명시적으로 보내는 것).
export async function sendPlanReportCard(d: {
  label: string; // 날짜 라벨 (예: "7/10 (금)")
  total: number; // 금일 설치계획 합계
  groups: PlanReportGroup[];
}): Promise<void> {
  const startUrl = process.env.TEAMS_WEBHOOK_URL;
  const consultUrl = process.env.TEAMS_COMPLETE_WEBHOOK_URL;
  if (!startUrl) throw new Error("시작보고 채팅방 웹후크가 설정되지 않았습니다. (TEAMS_WEBHOOK_URL)");
  if (!consultUrl) {
    throw new Error("협의사항 채팅방 웹후크가 설정되지 않았습니다. (TEAMS_COMPLETE_WEBHOOK_URL)");
  }

  const v = (s?: string) => s?.trim() || "-";
  // 제목은 채팅방별로 다름 — 시작보고방은 '설치계획 보고', 협의사항방은 '집합시간 및 특이사항 공지'
  const header = (title: string) => [
    {
      type: "TextBlock",
      size: "Large",
      weight: "Bolder",
      text: title,
      wrap: true,
    },
    {
      type: "TextBlock",
      text: `${d.label} 설치 계획`,
      isSubtle: true,
      spacing: "None",
      wrap: true,
    },
    {
      type: "TextBlock",
      weight: "Bolder",
      text: `금일 설치계획 ${d.total.toLocaleString()}대`,
      wrap: true,
    },
  ];
  const groupHead = (g: PlanReportGroup) => ({
    type: "TextBlock",
    weight: "Bolder",
    color: "Accent",
    text: `○ ${g.operator} · ${g.count.toLocaleString()}대`,
    spacing: "Medium",
    wrap: true,
  });
  const baseFacts = (g: PlanReportGroup) => [
    { title: "노선", value: g.routes.map((r) => `${r.route} ${r.count}대`).join(" · ") || "-" },
    { title: "집합시간", value: v(g.time) },
    { title: "설치 장소", value: v(g.place) },
  ];
  const mkCard = (body: unknown[]) => ({
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
        },
      },
    ],
  });

  // 시작보고방: 휴차 없이 간단히
  const startCard = mkCard([
    ...header("B820 단말기 설치계획 보고"),
    ...d.groups.flatMap((g) => [
      groupHead(g),
      { type: "FactSet", spacing: "Small", facts: baseFacts(g) },
    ]),
  ]);

  // 협의사항방: 휴차 + 도착시간 + 협조·확인사항 + 단말기 설치위치 + 특이사항.
  // 집합시간·설치 장소는 노선 위에 굵고 큰 글자(Medium)로 강조(사용자 요청).
  const consultCard = mkCard([
    ...header("집합시간 및 특이사항 공지"),
    ...d.groups.flatMap((g) => [
      groupHead(g),
      {
        type: "TextBlock",
        size: "Medium",
        weight: "Bolder",
        text: `집합시간 : ${v(g.time)}`,
        spacing: "Small",
        wrap: true,
      },
      {
        type: "TextBlock",
        size: "Medium",
        weight: "Bolder",
        text: `설치 장소 : ${v(g.place)}`,
        spacing: "None",
        wrap: true,
      },
      {
        type: "FactSet",
        spacing: "Small",
        facts: [
          {
            title: "노선",
            value: g.routes.map((r) => `${r.route} ${r.count}대`).join(" · ") || "-",
          },
          { title: "당일 휴차", value: v(g.dayOff) },
          { title: "익일 휴차", value: v(g.nextDayOff) },
          { title: "첫차 종료 후 도착", value: v(g.arrival) },
          { title: "차키 협조", value: v(g.keyMethod) },
          { title: "작업 중 시동", value: v(g.engineOn) },
          { title: "충전 여부", value: v(g.fuel) },
          { title: "표출기", value: v(g.mountDisplay) },
          { title: "통합단말기", value: v(g.mountMain) },
          { title: "승차", value: v(g.mountBoard) },
          { title: "격벽 손잡이 탈거", value: v(g.handleRemoval) },
          { title: "특이사항", value: v(g.notes) },
        ],
      },
    ]),
  ]);

  const targets = [
    { name: "시작보고 채팅방", url: startUrl, card: startCard },
    { name: "협의사항 채팅방", url: consultUrl, card: consultCard },
  ];
  for (const t of targets) {
    const res = await fetch(t.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t.card),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Teams 설치계획 응답(${t.name}) ${res.status} ${txt.slice(0, 160)}`);
    }
  }
}
