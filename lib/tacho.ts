// 타코확인 대상 판정 — 진행현황 엑셀 U열(타코 제조사)이 '조영 DT-202'인 차량.
// 공백·하이픈 표기 차이를 무시하고 "DT202" 포함 여부로 판정
// (다른 제조사 값 KDT-U-ST100R·NEW-KDT-1·태호 S&G2000 등에는 없는 문자열).
export function isTachoCheck(tacho: string | null | undefined): boolean {
  if (!tacho) return false;
  return tacho.replace(/[\s-]/g, "").toLowerCase().includes("dt202");
}
