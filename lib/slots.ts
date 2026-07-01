// 사진 슬롯 정의 — 화면/엑셀/PDF가 공유하는 기본값.
// 원본 엑셀 양식(B800 설치 사진첩)의 라벨/순서를 그대로 반영.

export type Section = "before" | "after";

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

// 기본 설치전 슬롯 + 동적 추가 슬롯을 병합해 최종 설치전 슬롯 목록 생성
export function buildBeforeSlots(customSlots: CustomSlot[] = []): SlotDef[] {
  const custom: SlotDef[] = [...customSlots]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({
      slotKey: c.slot_key,
      label: c.label,
      section: "before" as const,
      isCustom: true,
    }));
  return [...BEFORE_SLOTS, ...custom];
}

// 새 커스텀 슬롯 키 생성 (충돌 방지를 위해 호출부에서 인덱스/타임스탬프 전달)
export function makeCustomSlotKey(seq: number): string {
  return `before_custom_${seq}`;
}
