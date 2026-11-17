import type { DailyReport, ServiceCheck } from "./report";
import { checkTone, groupByOperator, noteRows, serviceCheckRows } from "./report";
import type { VocOperatorSummary } from "./voc";
import { VOC_RATINGS, starBar } from "./voc";

// 보고서 한 장의 공통 모양 — 설치계획·설치시작·설치완료 보고가 모두 이 모양으로 바뀌고,
// 같은 모양을 팀즈 카드(sheetToCard)와 보고용 이미지(lib/report-image.ts)가 각각 그린다.
// 그래서 카드와 이미지가 항상 같은 순서·같은 칸으로 나온다.
//   머리띠([프로젝트] + 제목 + 보조줄) → 수치 상자 줄들 → 섹션(제목 + 블록들)

export const DEFAULT_REPORT_LABEL = "인천버스 B820 단말기 설치 프로젝트";

export type Tone = "ok" | "bad" | "none" | "info";
export type SheetBlock =
  | { t: "band"; name: string; total?: string; note?: string } // 운수사 줄: 이름(+보조) ··· 합계(빨강)
  | { t: "grid"; cells: { label: string; count: string }[] } // 노선 칸 격자
  | { t: "facts"; rows: { label: string; value: string; tone?: Tone }[] } // 라벨 ··· 값
  | { t: "text"; text: string; bold?: boolean; subtle?: boolean; big?: boolean };
export interface Sheet {
  tag: string; // 머리띠 첫 줄 "[…]"
  title: string;
  sub?: string; // 머리띠 보조줄
  kpis: { label: string; value: string; accent?: boolean }[][]; // 줄마다 상자 칸들
  sections: { title: string; blocks: SheetBlock[] }[];
}

const dae = (n: number) => `${n.toLocaleString()}대`;
// 날짜 라벨 "11/17 (화)" → 제목용 "(11/17, 화)" — 완료 보고 제목과 같은 표기(괄호가 겹치지 않게)
const titleDate = (label: string) => {
  const m = /^(.+?)\s*\((.)\)$/.exec(label.trim());
  return m ? `(${m[1]}, ${m[2]})` : `(${label.trim()})`;
};

// 노선 격자 — 노선이 하나도 없으면(수량 차감 방식은 운수사 대수만) 생략
function routeGrid(routes: { route: string; count: number }[]): SheetBlock[] {
  const named = routes.filter((r) => r.route);
  return named.length ? [{ t: "grid", cells: routes.map((r) => ({ label: r.route || "노선 미지정", count: dae(r.count) })) }] : [];
}

// 특이사항 텍스트 → 줄 블록(자동 목록 머리줄은 굵게)
function noteBlocks(notes: string): SheetBlock[] {
  return noteRows(notes).map((n) => ({ t: "text", text: n.text, bold: n.head }));
}

// ── 설치 완료 보고 ──
export function completionSheet(
  r: DailyReport,
  notes: string,
  check?: ServiceCheck,
  vocs?: VocOperatorSummary[],
  projectLabel = DEFAULT_REPORT_LABEL,
): Sheet {
  const ops = groupByOperator(r.groups);
  const sections: Sheet["sections"] = [
    {
      title: "금일 설치 내역",
      blocks: ops.length
        ? ops.flatMap((o): SheetBlock[] => [{ t: "band", name: o.operator, total: dae(o.total) }, ...routeGrid(o.routes)])
        : [{ t: "text", text: "(완료 없음)", subtle: true }],
    },
  ];
  const checkRows = serviceCheckRows(check);
  if (checkRows.length) {
    sections.push({
      title: "운행시작 점검",
      blocks: [
        {
          t: "facts",
          rows: checkRows.map((row) => {
            const c = checkTone(row.value); // 그림문자 대신 글자색
            return { label: row.title, value: c.text, tone: c.tone };
          }),
        },
      ],
    });
  }
  if (vocs?.length) {
    sections.push({
      title: "운수사 VOC",
      blocks: vocs.flatMap((v): SheetBlock[] => [
        { t: "text", bold: true, text: `${v.operator} : ${v.avg !== null ? starBar(v.avg) : "평가 없음"} (${v.vehicles}대 중 ${v.rated}대 응답)` },
        {
          t: "facts",
          rows: VOC_RATINGS.filter((k) => v.averages[k.key] !== undefined).map((k) => ({ label: k.label, value: starBar(v.averages[k.key]!) })),
        },
        ...v.comments.map((c): SheetBlock => ({ t: "text", subtle: true, text: `${c.plate}${c.route ? ` (${c.route})` : ""} : ${c.comment}` })),
        ...(v.notes ? [{ t: "text", subtle: true, text: `특이사항 : ${v.notes}` } as SheetBlock] : []),
      ]),
    });
  }
  sections.push({ title: "특이사항", blocks: noteBlocks(notes) });
  return {
    tag: `[${projectLabel}]`,
    title: `설치 완료 보고 (${r.label}, ${r.dow})`,
    kpis: [
      [
        { label: "금일 실적", value: dae(r.dailyDone) },
        { label: "금일 계획", value: dae(r.dailyPlanned) },
        { label: "달성률", value: `${r.dailyPct.toFixed(1)}%`, accent: true },
      ],
      [
        { label: "누적 계획", value: dae(r.cumPlanned) },
        { label: "누적 완료", value: `${dae(r.cumDone)} (${r.cumPct.toFixed(1)}%)` },
        { label: "잔여", value: dae(r.remaining) },
      ],
    ],
    sections,
  };
}

// ── 설치 시작 보고 ──
export interface StartSheetInput {
  label: string; // "11/16 (월)"
  startTime?: string; // "05:30"
  todayPlanned: number;
  complete: number; // 작업 시작 전 누적 완료
  remain: number;
  groups: { operator: string; route: string; planned: number; manager?: string }[];
  note?: string;
}
export function startSheet(d: StartSheetInput, projectLabel = DEFAULT_REPORT_LABEL): Sheet {
  const byOp = new Map<string, { manager: string; total: number; routes: { route: string; count: number }[] }>();
  for (const g of d.groups) {
    const o = byOp.get(g.operator) ?? { manager: "", total: 0, routes: [] };
    if (g.manager) o.manager = g.manager;
    o.total += g.planned;
    o.routes.push({ route: g.route, count: g.planned });
    byOp.set(g.operator, o);
  }
  const sections: Sheet["sections"] = [
    {
      title: "운수사별 설치계획",
      blocks: [...byOp].flatMap(([op, o]): SheetBlock[] => [
        { t: "band", name: op, total: dae(o.total), note: o.manager ? `담당 ${o.manager}` : undefined },
        ...routeGrid(o.routes),
      ]),
    },
  ];
  if (d.note?.trim()) sections.push({ title: "특이사항", blocks: noteBlocks(d.note) });
  return {
    tag: `[${projectLabel}]`,
    title: `설치 시작 보고 ${titleDate(d.label)}`,
    kpis: [
      [
        { label: "시작시간", value: d.startTime || "-", accent: true },
        { label: "금일 설치계획", value: dae(d.todayPlanned) },
      ],
      [
        { label: "누적 완료", value: dae(d.complete) },
        { label: "잔여(설치대상)", value: dae(d.remain) },
      ],
    ],
    sections,
  };
}

// ── 설치계획 보고 ──
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
  mountAlight?: string; // 하차 방향
  handleRemoval?: string; // 격벽 손잡이 탈거
  notes?: string; // 특이사항
}
export interface PlanSheetInput {
  label: string; // "11/16 (월)"
  total: number;
  groups: PlanReportGroup[];
  titles?: Record<string, string>; // 협의사항 양식의 항목 표기(컬럼명 → 표기). 없으면 B820 기본 표기
}
// variant: "start" = 시작보고방(설치계획 보고 — 노선·집합시간·설치 장소, 휴차 없음)
//          "consult" = 협의사항방(집합시간 및 특이사항 공지 — 휴차·도착·협조확인·설치위치까지)
export function planSheet(d: PlanSheetInput, variant: "start" | "consult", projectLabel = DEFAULT_REPORT_LABEL): Sheet {
  const v = (s?: string) => s?.trim() || "-";
  const t = (key: string, fallback: string) => d.titles?.[key] ?? fallback;
  const blocks = d.groups.flatMap((g): SheetBlock[] => {
    const head: SheetBlock[] = [{ t: "band", name: g.operator, total: dae(g.count) }, ...routeGrid(g.routes)];
    if (variant === "start") {
      return [
        ...head,
        {
          t: "facts",
          rows: [
            { label: "집합시간", value: v(g.time) },
            { label: "설치 장소", value: v(g.place) },
            // 특이사항은 입력된 운수사만 (시작보고방은 간결하게)
            ...(g.notes?.trim() ? [{ label: "특이사항", value: g.notes.trim() }] : []),
          ],
        },
      ];
    }
    // 협의사항방: 집합시간·설치 장소를 굵고 크게(설치팀이 가장 먼저 봐야 하는 값).
    // 나머지 협의 항목은 입력된 것만 — 빈 항목까지 '-'로 다 적으면 카드가 운수사당 12줄씩 길어진다.
    const rows = [
      { label: t("day_off", "당일 휴차"), value: g.dayOff },
      { label: t("next_day_off", "익일 휴차"), value: g.nextDayOff },
      { label: t("arrival", "첫차 종료 후 도착"), value: g.arrival },
      { label: t("key_method", "차키 협조"), value: g.keyMethod },
      { label: t("engine_on", "작업 중 시동"), value: g.engineOn },
      { label: t("fuel", "충전 여부"), value: g.fuel },
      { label: t("mount_display", "표출기"), value: g.mountDisplay },
      { label: t("mount_main", "통합단말기"), value: g.mountMain },
      { label: t("mount_board", "승차"), value: g.mountBoard },
      { label: t("mount_alight", "하차(방향)"), value: g.mountAlight },
      { label: t("handle_removal", "격벽 손잡이 탈거"), value: g.handleRemoval },
      { label: t("notes", "특이사항"), value: g.notes },
    ].flatMap((r) => (r.value?.trim() ? [{ label: r.label, value: r.value.trim() }] : []));
    return [
      ...head,
      { t: "text", big: true, bold: true, text: `집합시간 : ${v(g.time)}` },
      { t: "text", big: true, bold: true, text: `설치 장소 : ${v(g.place)}` },
      rows.length ? { t: "facts", rows } : { t: "text", subtle: true, text: "협의사항 입력 없음" },
    ];
  });
  return {
    tag: `[${projectLabel}]`,
    title: `${variant === "start" ? "설치계획 보고" : "집합시간 및 특이사항 공지"} ${titleDate(d.label)}`,
    kpis: [
      [
        { label: "금일 설치계획", value: dae(d.total), accent: true },
        { label: "운수사", value: `${d.groups.length.toLocaleString()}곳` },
      ],
    ],
    sections: [{ title: "운수사별 계획", blocks }],
  };
}

// ── 팀즈 카드로 ──
// 칸은 ColumnSet/Column 배경(style)으로 만든다 — 팀즈 폰 앱은 카드 1.2까지만 확실히 그리므로
// Table(1.5)은 쓰지 않는다. 테두리(showBorder/roundedCorners)는 PC에서만 보이는 덤이고 모르는 기기는
// 무시하므로, 폰에서도 회색 칸으로 오와 열이 그대로 맞는다.
const GRID_COLS = 3; // 노선 칸 열 수(이미지는 4열 — 카드는 폰 폭을 고려해 3열)
const boxed = { showBorder: true, roundedCorners: true };
// 숫자와 단위 사이에 줄바꿈 금지 문자(U+2060 WORD JOINER) — 좁은 화면에서 "5대"가 "5 / 대"로 갈라지지 않게
const keep = (s: string) => s.replace(/(\d)(대|곳|%)/g, "$1⁠$2");
const TONE_CARD: Record<Tone, Record<string, unknown>> = {
  ok: { color: "Good" },
  bad: { color: "Attention" },
  none: { isSubtle: true },
  info: {},
};

function blockToCard(b: SheetBlock, first: boolean): unknown[] {
  switch (b.t) {
    case "band":
      return [
        {
          type: "ColumnSet",
          spacing: first ? "Small" : "Medium",
          columns: [
            {
              type: "Column",
              width: "stretch",
              items: [
                { type: "TextBlock", text: b.name, weight: "Bolder", wrap: true },
                ...(b.note ? [{ type: "TextBlock", text: b.note, isSubtle: true, size: "Small", spacing: "None", wrap: true }] : []),
              ],
            },
            ...(b.total
              ? [{ type: "Column", width: "auto", items: [{ type: "TextBlock", text: keep(b.total), weight: "Bolder", color: "Attention" }] }]
              : []),
          ],
        },
      ];
    case "grid": {
      const out: unknown[] = [];
      for (let i = 0; i < b.cells.length; i += GRID_COLS) {
        out.push({
          type: "ColumnSet",
          spacing: "Small",
          columns: Array.from({ length: GRID_COLS }, (_, k) => {
            const c = b.cells[i + k];
            return {
              type: "Column",
              width: "stretch",
              ...(c ? { style: "emphasis", ...boxed } : {}),
              // 칸 안은 항상 두 줄(윗줄 노선, 아랫줄 굵은 대수). 한 줄로 두면 좁은 화면에서 칸마다 접히는
              // 자리가 달라 오와 열이 틀어지고, 칸 안을 좌우로 다시 나누면 대수가 "5…"로 잘린다.
              items: c
                ? [
                    { type: "TextBlock", text: c.label, wrap: true },
                    { type: "TextBlock", text: keep(c.count), weight: "Bolder", spacing: "None", wrap: true },
                  ]
                : [{ type: "TextBlock", text: " " }],
            };
          }),
        });
      }
      return out;
    }
    case "facts":
      // 라벨 칸 너비를 고정해 값이 한 열로 맞게, 그림문자 대신 글자색으로 상태 표시
      return b.rows.map((row, i) => ({
        type: "ColumnSet",
        spacing: i === 0 ? "Small" : "None",
        columns: [
          { type: "Column", width: "110px", items: [{ type: "TextBlock", text: row.label, isSubtle: true, wrap: true }] },
          { type: "Column", width: "stretch", items: [{ type: "TextBlock", text: row.value, wrap: true, ...TONE_CARD[row.tone ?? "info"] }] },
        ],
      }));
    case "text":
      return [
        {
          type: "TextBlock",
          text: b.text,
          spacing: first || b.big ? "Small" : "None", // 큰 글씨 줄은 위 노선 칸에 붙지 않게
          wrap: true,
          ...(b.bold ? { weight: "Bolder" } : {}),
          ...(b.subtle ? { isSubtle: true } : {}),
          ...(b.big ? { size: "Medium" } : {}),
        },
      ];
  }
}

export function sheetToCard(s: Sheet): unknown {
  const body: unknown[] = [
    // 머리띠
    {
      type: "Container",
      style: "accent",
      bleed: true,
      items: [
        { type: "TextBlock", text: s.tag, size: "Small", isSubtle: true, wrap: true },
        { type: "TextBlock", text: s.title, size: "Large", weight: "Bolder", spacing: "None", wrap: true },
        ...(s.sub ? [{ type: "TextBlock", text: s.sub, spacing: "None", wrap: true }] : []),
      ],
    },
    // 수치 상자 줄들 — 작은 라벨 + 굵은 값, 회색 상자
    ...s.kpis.map((row, i) => ({
      type: "ColumnSet",
      spacing: i === 0 ? "Medium" : "Small",
      columns: row.map((k) => ({
        type: "Column",
        width: "stretch",
        style: "emphasis",
        ...boxed,
        items: [
          { type: "TextBlock", text: k.label, isSubtle: true, size: "Small", wrap: true },
          {
            type: "TextBlock",
            text: keep(k.value),
            weight: "Bolder",
            size: "Medium",
            spacing: "None",
            wrap: true,
            ...(k.accent ? { color: "Attention" } : {}),
          },
        ],
      })),
    })),
  ];
  s.sections.forEach((sec, i) => {
    // 첫 섹션은 수치 상자 바로 아래라 구분선 없이, 이후 섹션은 구분선으로 나눈다
    body.push({ type: "TextBlock", text: sec.title, weight: "Bolder", spacing: "Large", separator: i > 0, wrap: true });
    sec.blocks.forEach((b, j) => body.push(...blockToCard(b, j === 0)));
  });
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          msteams: { width: "Full" }, // 팀즈 PC에서 카드 폭을 넓게 — 칸이 좁아 노선명이 접히지 않게
          body,
        },
      },
    ],
  };
}
