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

// 차량 이상유무 중 사진 필수 항목 — '없음' 체크 불가, 실제 사진이 있어야
// 다음 단계 진행·저장 가능 (클라이언트·서버 공용 기준)
export const REQUIRED_CHECK_KEYS = ["check_led", "check_dashboard", "check_cctv"];

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

// 설치 후 추가 촬영 항목 — DB(photos)·Drive에는 저장하되
// PDF/엑셀·완료 판정(표준 14칸)·KPI 집계에는 포함하지 않는다.
export const AFTER_EXTRA_SLOTS: SlotDef[] = [
  { slotKey: "after_tacho_y", label: "타코케이블 Y자유무", section: "after" },
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
export function buildBeforeSlots(customSlots: CustomSlot[] = [], base: SlotDef[] = BEFORE_SLOTS): SlotDef[] {
  return [...base, ...pickCustom(customSlots, "before_custom_", "before")];
}

// 차량 이상유무 8종 + 동적 추가 슬롯 (추가 슬롯도 check_photos·Drive 하위폴더에 저장,
// 설치시작 판정에는 기본 8종만 포함)
export function buildCheckSlots(customSlots: CustomSlot[] = [], base: SlotDef[] = CHECK_SLOTS): SlotDef[] {
  return [...base, ...pickCustom(customSlots, "check_custom_", "check")];
}

// 새 커스텀 슬롯 키 생성 (충돌 방지를 위해 호출부에서 인덱스/타임스탬프 전달)
export function makeCustomSlotKey(seq: number): string {
  return `before_custom_${seq}`;
}

export function makeCheckCustomSlotKey(seq: number): string {
  return `check_custom_${seq}`;
}

// ────────────────────────────────────────────────────────────────
// 프로젝트별 사진 양식(칸 구성) — 관리자 페이지 '사진 양식' 탭에서 조정.
// 저장: app_settings.photo_slots (JSON SlotConfigJson). 없으면 위 B820 기본값.
// 키는 한 번 정하면 바꾸지 않는다(사진·없음체크가 키로 저장됨). 라벨만 바꾸는 건 안전.
// ────────────────────────────────────────────────────────────────

export interface SlotConfig {
  before: SlotDef[]; // 설치 전 (완료 판정 포함)
  after: SlotDef[]; // 설치 후 (완료 판정 포함)
  afterExtra: SlotDef[]; // 설치 후 추가 촬영 (저장만, 완료 판정·PDF 제외)
  check: SlotDef[]; // 차량 이상유무 (설치 시작 판정)
  requiredCheckKeys: string[]; // 이상유무 중 사진 필수('없음' 불가)
}

export interface SlotConfigJson {
  before: { key: string; label: string }[];
  after: { key: string; label: string; extra?: boolean }[];
  check: { key: string; label: string; required?: boolean }[];
}

export const DEFAULT_SLOT_CONFIG: SlotConfig = {
  before: BEFORE_SLOTS,
  after: AFTER_SLOTS,
  afterExtra: AFTER_EXTRA_SLOTS,
  check: CHECK_SLOTS,
  requiredCheckKeys: REQUIRED_CHECK_KEYS,
};

export const SLOT_KEY_RE = /^(before|after|check)_[a-z0-9_]{1,40}$/;
const MAX_PER_SECTION = 20;

export function toSlotConfigJson(c: SlotConfig): SlotConfigJson {
  const req = new Set(c.requiredCheckKeys);
  return {
    before: c.before.map((s) => ({ key: s.slotKey, label: s.label })),
    after: [
      ...c.after.map((s) => ({ key: s.slotKey, label: s.label })),
      ...c.afterExtra.map((s) => ({ key: s.slotKey, label: s.label, extra: true })),
    ],
    check: c.check.map((s) => ({ key: s.slotKey, label: s.label, ...(req.has(s.slotKey) ? { required: true } : {}) })),
  };
}

/** 입력(JSON 객체) 검증 → SlotConfig. 문제가 있으면 사유 문자열. */
export function validateSlotConfig(v: unknown): SlotConfig | string {
  if (!v || typeof v !== "object") return "형식이 잘못되었습니다.";
  const o = v as Partial<SlotConfigJson>;
  const seen = new Set<string>();
  const read = (
    arr: unknown,
    section: Section,
    name: string,
  ): { key: string; label: string; extra?: boolean; required?: boolean }[] | string => {
    if (!Array.isArray(arr)) return `${name} 목록이 없습니다.`;
    if (arr.length > MAX_PER_SECTION) return `${name}은(는) ${MAX_PER_SECTION}개까지입니다.`;
    const out: { key: string; label: string; extra?: boolean; required?: boolean }[] = [];
    for (const it of arr) {
      const key = String((it as { key?: unknown })?.key ?? "").trim();
      const label = String((it as { label?: unknown })?.label ?? "").trim();
      if (!SLOT_KEY_RE.test(key) || !key.startsWith(section + "_")) return `${name} 칸의 키가 잘못되었습니다: ${key || "(비어 있음)"}`;
      if (key.startsWith("before_custom_") || key.startsWith("check_custom_")) return `${key} 는 차량별 추가 칸에 쓰는 키라 양식에 넣을 수 없습니다.`;
      if (seen.has(key)) return `키가 중복됩니다: ${key}`;
      seen.add(key);
      if (!label || label.length > 30) return `${name} 칸 이름은 1~30자로 입력하세요.`;
      out.push({ key, label, extra: (it as { extra?: unknown }).extra === true, required: (it as { required?: unknown }).required === true });
    }
    return out;
  };
  const before = read(o.before, "before", "설치 전");
  if (typeof before === "string") return before;
  const after = read(o.after, "after", "설치 후");
  if (typeof after === "string") return after;
  const check = read(o.check, "check", "차량 이상유무");
  if (typeof check === "string") return check;
  if (before.length === 0) return "설치 전 칸은 최소 1개 필요합니다.";
  if (after.filter((s) => !s.extra).length === 0) return "설치 후(완료 판정) 칸은 최소 1개 필요합니다.";
  const def = (s: { key: string; label: string }, section: Section): SlotDef => ({ slotKey: s.key, label: s.label, section });
  return {
    before: before.map((s) => def(s, "before")),
    after: after.filter((s) => !s.extra).map((s) => def(s, "after")),
    afterExtra: after.filter((s) => s.extra).map((s) => def(s, "after")),
    check: check.map((s) => def(s, "check")),
    requiredCheckKeys: check.filter((s) => s.required).map((s) => s.key),
  };
}

/** 저장값 → SlotConfig. 없거나 깨졌으면 B820 기본값. */
export function parseSlotConfig(raw: string | null): SlotConfig {
  if (!raw) return DEFAULT_SLOT_CONFIG;
  try {
    const c = validateSlotConfig(JSON.parse(raw));
    return typeof c === "string" ? DEFAULT_SLOT_CONFIG : c;
  } catch {
    return DEFAULT_SLOT_CONFIG;
  }
}

export function isDefaultSlotConfig(c: SlotConfig): boolean {
  return JSON.stringify(toSlotConfigJson(c)) === JSON.stringify(toSlotConfigJson(DEFAULT_SLOT_CONFIG));
}

/** 완료 판정에 드는 표준 칸 키 (설치 전 + 설치 후) */
export function stdSlotKeys(c: SlotConfig): string[] {
  return [...c.before, ...c.after].map((s) => s.slotKey);
}

/** 기본 촬영 장수 = 설치 전 + 설치 후 */
export function photoCount(c: SlotConfig): number {
  return c.before.length + c.after.length;
}

/** 관리자가 칸을 추가할 때 쓰는 새 키 */
export function newSlotKey(section: Section): string {
  return `${section}_u${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`;
}
