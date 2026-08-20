// LTE 모뎀 사용내역(모뎀불량) 공용 정의 — 배차표 팝업·API·엑셀이 함께 쓴다.

export const MODEM_KINDS = ["현장교체", "증차", "예비품불량", "장애접수"] as const;
export type ModemKind = (typeof MODEM_KINDS)[number];

// 차량 행 팝업의 구분 탭 — 예비품불량은 차량과 무관하므로 빠진다.
export const MODEM_VEHICLE_KINDS = ["현장교체", "증차", "장애접수"] as const;

// 예비품불량 = 재고 예비 모뎀 자체가 불량인 건. 차량번호가 없어서 배차표의
// '모뎀 예비품불량 등록' 버튼으로 따로 받는다. (date, plate) unique를 그대로
// 쓰려고 차량번호 자리에 모뎀 번호를 넣는다 — 같은 날 같은 모뎀은 한 건이면 된다.
export const MODEM_SPARE_KIND = "예비품불량";
export function sparePlate(sn: string): string {
  return `예비품 ${sn.trim()}`;
}

// 장애접수 = 교체할 모뎀이 없어 업체(AI텔레콤)에 인계하는 건.
// 모뎀을 쓰지 않았으므로 사용내역 엑셀에는 넣지 않고, 금일완료 리포트 특이사항에만
// 아래 라벨로 [설치제외]·[타코 미연결]과 같은 모양의 블록으로 나간다.
export const MODEM_FAULT_KIND = "장애접수";
export const MODEM_FAULT_LABEL = "AI텔레콤 김승현 부장 장애접수";

// 증상 선택지 — 직접 입력 없이 고르기만 한다(엑셀 F열).
export const MODEM_SYMPTOMS = [
  "LTE모뎀 LED정상 통신X",
  "LTE통신불량(적색)",
] as const;

// 예비품(재고 불량)·장애접수(교체 자체를 못 함)는 차량에 단 게 없으므로 사진을 찍지 않는다.
export function needsPhoto(kind: string): boolean {
  return kind !== "예비품불량" && kind !== MODEM_FAULT_KIND;
}

// 증차 = 새로 다는 것이라 고장 증상·교체 전 번호가 없다. 번호는 '설치 모뎀' 하나뿐이고,
// 사진은 4장(차량번호 · 모뎀 뒷면 · LTE 설치 · LTE 정보)으로 뒷면이 한 장 더 들어간다.
export const MODEM_NEW_KIND = "증차";
export function isNewModem(kind: string): boolean {
  return kind === MODEM_NEW_KIND;
}

// 장애접수는 교체할 모뎀이 없어 접수하는 것 — 교체 후 번호를 요구하지 않는다.
export function needsAfterSn(kind: string): boolean {
  return kind !== MODEM_FAULT_KIND;
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
