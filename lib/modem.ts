// LTE 모뎀 사용내역(모뎀불량) 공용 정의 — 배차표 팝업·API·엑셀이 함께 쓴다.

export const MODEM_KINDS = ["현장교체", "증차", "예비품불량"] as const;
export type ModemKind = (typeof MODEM_KINDS)[number];

// 증상 선택지 — 직접 입력 없이 고르기만 한다(엑셀 F열).
export const MODEM_SYMPTOMS = [
  "LTE모뎀 LED정상 통신X",
  "LTE통신불량(적색)",
] as const;

// 예비품(교체 전에 이미 불량인 재고)은 차량에 달지 않으므로 사진을 찍지 않는다.
export function needsPhoto(kind: string): boolean {
  return kind !== "예비품불량";
}

export interface ModemEntry {
  kind: ModemKind;
  symptom: string;
  beforeSn: string;
  afterSn: string;
  hasPhoto: boolean; // 엑셀 G열 '사진 유무'
}

// Drive 최상위 폴더명 — 루트(GDRIVE_FOLDER_ID)/LTE모뎀불량/운수사명/차량번호
export const MODEM_FOLDER = "LTE모뎀불량";

// DB 차량번호(인천70바4652) → AI텔레콤 양식 표기(70-4652).
// 형식이 다르면 원본 그대로 둔다.
export function shortPlate(plate: string): string {
  const m = plate.trim().match(/^\D*(\d+)\D+(\d+)$/);
  return m ? `${m[1]}-${m[2]}` : plate.trim();
}
