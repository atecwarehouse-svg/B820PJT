// 배차표 '검수항목 보기' 체크리스트 — 기본값과 타입.
// 관리자 페이지에서 수정한 값은 app_settings.inspect_checklist에 저장되고,
// 미설정/오류 시 이 기본값으로 폴백한다. (클라이언트에서도 import 가능)

export interface ChecklistItem {
  t: string; // 항목명
  s: string; // 부연 설명(괄호 안, 없으면 "")
}

export interface Checklist {
  vehicle: ChecklistItem[]; // 1. 차량 이상유무
  device: ChecklistItem[]; // 2. 단말기 설치 상태
}

export const DEFAULT_CHECKLIST: Checklist = {
  vehicle: [
    { t: "CCTV 모니터·셋톱", s: "분할화면·전환화면 포함" },
    { t: "전광판", s: "" },
    { t: "계기판 경고등", s: "" },
    { t: "도어 작동 유무", s: "" },
    { t: "라디오", s: "안테나 신호·음성" },
    { t: "차량 파손 유무", s: "마감제 분실" },
  ],
  device: [
    { t: "승하차 위치", s: "1번 → 3번 → 2번 순서 (다인승 테스트)" },
    { t: "비닐 제거", s: "" },
    { t: "카드 태그 시 음성·화면 이상유무", s: "" },
    { t: "전원 2차전원", s: "상시·ACC는 재작업" },
    { t: "표출기 흔들림·운전자 간섭 유무", s: "기어 변속 등" },
    { t: "구멍 마감", s: "" },
    { t: "연동장비 확인", s: "타코 · 전자노선도 · 빈좌석" },
    { t: "피스구멍 테이핑 상태", s: "" },
    { t: "하차벨 테스트", s: "" },
  ],
};

// 저장된 JSON을 안전하게 파싱 — 형식이 어긋나면 null (호출측에서 기본값 폴백)
export function parseChecklist(raw: string): Checklist | null {
  try {
    const obj = JSON.parse(raw);
    const clean = (arr: unknown): ChecklistItem[] | null => {
      if (!Array.isArray(arr)) return null;
      return arr
        .map((v) => ({
          t: String((v as ChecklistItem)?.t ?? "").trim(),
          s: String((v as ChecklistItem)?.s ?? "").trim(),
        }))
        .filter((v) => v.t);
    };
    const vehicle = clean(obj?.vehicle);
    const device = clean(obj?.device);
    if (!vehicle || !device || (vehicle.length === 0 && device.length === 0)) return null;
    return { vehicle, device };
  } catch {
    return null;
  }
}
