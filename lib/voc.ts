// 운수사 VOC 평가 항목 — 폼(VocModal)·저장 API·관리자 화면(VocManager)이 공유한다.
// 1~4번은 5점 만점 별점, 5번 기타 의견은 자유 텍스트(comment).
export const VOC_RATINGS = [
  { key: "usability", label: "조작 및 사용편의성" },
  { key: "stability", label: "작동 및 통신 안정성" },
  { key: "install", label: "설치 위치 및 마감상태" },
  { key: "overall", label: "종합만족도" },
] as const;

export type VocRatingKey = (typeof VOC_RATINGS)[number]["key"];

export const VOC_MAX_STARS = 5;

export type VocRatings = Partial<Record<VocRatingKey, number>>;

export interface VocItem {
  plate: string;
  route?: string;
  ratings: VocRatings;
  comment: string; // 기타 의견
}

// 저장/수정 시 공용 정제 — 별점은 1~5 정수만 남기고, 나머지는 버린다.
export function cleanRatings(raw: unknown): VocRatings {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out: VocRatings = {};
  for (const { key } of VOC_RATINGS) {
    const n = Number(src[key]);
    if (Number.isFinite(n) && n >= 1 && n <= VOC_MAX_STARS) out[key] = Math.round(n);
  }
  return out;
}

// 입력된 별점들의 평균 (없으면 null)
export function averageRating(r: VocRatings): number | null {
  const values = VOC_RATINGS.map(({ key }) => r[key]).filter(
    (v): v is number => typeof v === "number",
  );
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// 별점이나 의견이 하나라도 입력됐는지 — '접수 건수' 집계용
export function hasVocInput(item: { ratings?: VocRatings; comment?: string }): boolean {
  return averageRating(item.ratings ?? {}) !== null || Boolean(item.comment?.trim());
}

// ── 리포트용 요약 ────────────────────────────────────────────────
// 저장된 VOC 행(vocs)을 운수사별 요약으로 바꾼다. 금일완료 리포트 2차 발송에서
// 메일·팀즈 카드가 공유한다.
export interface VocRow {
  operator: string;
  date: string;
  items?: { plate?: string; route?: string; ratings?: unknown; comment?: string }[] | null;
  notes?: string | null;
}

export interface VocOperatorSummary {
  operator: string;
  vehicles: number; // 평가 대상 차량 수
  rated: number; // 실제로 입력된 차량 수
  averages: Partial<Record<VocRatingKey, number>>; // 항목별 평균
  avg: number | null; // 전체 평균
  comments: { plate: string; route?: string; comment: string }[];
  notes?: string; // 운수사 전체 특이사항
}

export function summarizeVocs(rows: VocRow[]): VocOperatorSummary[] {
  return rows
    .map((row) => {
      const items = (row.items ?? []).map((i) => ({
        plate: String(i?.plate ?? ""),
        route: i?.route ? String(i.route) : undefined,
        ratings: cleanRatings(i?.ratings),
        comment: String(i?.comment ?? "").trim(),
      }));
      const averages: Partial<Record<VocRatingKey, number>> = {};
      for (const { key } of VOC_RATINGS) {
        const vals = items
          .map((i) => i.ratings[key])
          .filter((v): v is number => typeof v === "number");
        if (vals.length) averages[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
      }
      const perVehicle = items
        .map((i) => averageRating(i.ratings))
        .filter((a): a is number => a !== null);
      return {
        operator: row.operator,
        vehicles: items.length,
        rated: items.filter((i) => hasVocInput(i)).length,
        averages,
        avg: perVehicle.length ? perVehicle.reduce((a, b) => a + b, 0) / perVehicle.length : null,
        comments: items
          .filter((i) => i.comment)
          .map((i) => ({ plate: i.plate, route: i.route, comment: i.comment })),
        notes: row.notes?.trim() || undefined,
      };
    })
    .sort((a, b) => a.operator.localeCompare(b.operator, "ko"));
}

// 평균 점수 → 별표 5칸. 숫자 대신 별로 보여달라는 요청(2026-07-20)에 따라
// 메일·팀즈·관리자 화면이 모두 이 표기를 쓴다. 반올림해 채운 별(★)과 빈 별(☆)로만
// 그린다 — 반쪽 별 기호는 클라이언트마다 렌더링이 달라서 쓰지 않는다.
export function starBar(v: number): string {
  const filled = Math.min(VOC_MAX_STARS, Math.max(0, Math.round(v)));
  return "★".repeat(filled) + "☆".repeat(VOC_MAX_STARS - filled);
}
