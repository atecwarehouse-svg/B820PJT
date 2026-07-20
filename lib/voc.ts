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
