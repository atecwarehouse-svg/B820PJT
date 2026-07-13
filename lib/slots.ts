// 사진 슬롯 정의 — 화면/엑셀/PDF가 공유하는 기본값.
// 원본 엑셀 양식(B800 설치 사진첩)의 라벨/순서를 그대로 반영.

// "check" = 차량 이상유무 확인 사진 (작업 시작 전 촬영).
// 별도 테이블(check_photos)·Drive 하위폴더에 저장되고 PDF/엑셀·KPI 집계에는 포함되지 않는다.
export type Section = "before" | "after" | "check";

export interface SlotDef {
  slotKey: string; // 고유 키 (storage 경로 + DB unique)
  label: string; // 칸 라벨
  section: Section;
  isCustom?: boolean;
}

// 설치 전 (7개, 사용자가 항목 추가 가능)
export const BEFORE_SLOTS: SlotDef[] = [
  { slotKey: "before_plate", label: "차량번호", section: "before" },
  { slotKey: "before_gps", label: "GPS안테나", section: "before" },
  { slotKey: "before_operator", label: "운전자 조작기", section: "before" },
  { slotKey: "before_terminal", label: "운전석 통합단말기 사진", section: "before" },
  { slotKey: "before_board", label: "승차단말기", section: "before" },
  { slotKey: "before_alight1", label: "하차1 단말기", section: "before" },
  { slotKey: "before_alight2", label: "하차2 단말기", section: "before" },
];

// 차량 이상유무 확인 (8개, 고정 — 작업 시작 전 촬영. 장비가 없는 차량은 '없음' 체크)
// 설치시작 팀즈 알림 조건: 설치전 7칸 + 이 8칸이 모두 충족(사진 또는 없음).
export const CHECK_SLOTS: SlotDef[] = [
  { slotKey: "check_led", label: "전광판", section: "check" },
  { slotKey: "check_dashboard", label: "차량계기판", section: "check" },
  { slotKey: "check_announce", label: "안내방송", section: "check" },
  { slotKey: "check_tacho", label: "타코메타", section: "check" },
  { slotKey: "check_clock", label: "시계", section: "check" },
  { slotKey: "check_cctv", label: "CCTV", section: "check" },
  { slotKey: "check_routemap", label: "전자노선도", section: "check" },
  { slotKey: "check_seat", label: "빈좌석표시기", section: "check" },
];

// 설치 후 (7개, 고정)
export const AFTER_SLOTS: SlotDef[] = [
  { slotKey: "after_gps", label: "GPS안테나", section: "after" },
  { slotKey: "after_terminal", label: "통합단말기", section: "after" },
  { slotKey: "after_lte", label: "LTE외장모뎀", section: "after" },
  { slotKey: "after_display", label: "표출기", section: "after" },
  { slotKey: "after_board", label: "승차단말기", section: "after" },
  { slotKey: "after_alight1", label: "하차1 단말기", section: "after" },
  { slotKey: "after_alight2", label: "하차2 단말기", section: "after" },
];

// 기본 촬영 장수 = 설치 전(7) + 설치 후(7) = 14장.
// 완료 판정/대시보드/목록 표시의 단일 기준값.
export const DEFAULT_PHOTO_COUNT = BEFORE_SLOTS.length + AFTER_SLOTS.length;

export interface CustomSlot {
  slot_key: string;
  label: string;
  sort_order: number;
}

// records.custom_slots 한 배열에 설치전(before_custom_*)·이상유무(check_custom_*)
// 커스텀 슬롯을 함께 저장하고, 접두사로 섹션을 구분한다.
function pickCustom(
  customSlots: CustomSlot[],
  prefix: string,
  section: Section,
): SlotDef[] {
  return [...customSlots]
    .filter((c) => c.slot_key.startsWith(prefix))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({
      slotKey: c.slot_key,
      label: c.label,
      section,
      isCustom: true,
    }));
}

// 기본 설치전 슬롯 + 동적 추가 슬롯을 병합해 최종 설치전 슬롯 목록 생성
export function buildBeforeSlots(customSlots: CustomSlot[] = []): SlotDef[] {
  return [...BEFORE_SLOTS, ...pickCustom(customSlots, "before_custom_", "before")];
}

// 차량 이상유무 8종 + 동적 추가 슬롯 (추가 슬롯도 check_photos·Drive 하위폴더에 저장,
// 설치시작 판정에는 기본 8종만 포함)
export function buildCheckSlots(customSlots: CustomSlot[] = []): SlotDef[] {
  return [...CHECK_SLOTS, ...pickCustom(customSlots, "check_custom_", "check")];
}

// 새 커스텀 슬롯 키 생성 (충돌 방지를 위해 호출부에서 인덱스/타임스탬프 전달)
export function makeCustomSlotKey(seq: number): string {
  return `before_custom_${seq}`;
}

export function makeCheckCustomSlotKey(seq: number): string {
  return `check_custom_${seq}`;
}
