// 운수사 협의사항 폼 양식 — 항목명·카드 표기·선택지·사용 여부를 프로젝트별로 조정 (app_settings.consult_form).
// 항목 키는 consultations 테이블 컬럼명과 같고 고정이다(새 항목 추가는 DB 컬럼이 필요해 미지원).
// 폼(ConsultationModal)·팀즈 카드(sendConsultationCard)·관리자 조회(ConsultationManager)가 같은 순서·이름을 쓴다.

export type ConsultFieldType = "text" | "time" | "textarea" | "heading";

export interface ConsultField {
  key: string; // 컬럼명 (heading은 h_*)
  type: ConsultFieldType;
  label: string; // 폼 항목명 (heading은 소제목)
  title?: string; // 팀즈 카드·관리자 조회 표기(짧게). 비면 label
  options?: string[]; // 선택지 — 있으면 드롭다운, "직접입력"이 있으면 직접 입력란 노출 (text만)
  enabled: boolean; // 끄면 폼·카드에서 숨김 (저장값은 비움)
}

// 항목별 고정 동작 — 양식에서 바꾸지 않는 메타 (placeholder·접미·기본값·숨김 규칙)
// ponytail: placeholder/기본값은 편집 UI 없이 키 기준 고정. 이름을 크게 바꾸는 프로젝트가 생기면 양식 항목으로 옮길 것
export const CONSULT_META: Record<
  string,
  { placeholder?: string; suffix?: string; preset?: string; max?: number; hideEmpty?: boolean }
> = {
  list_check: { max: 20 },
  list_change: { placeholder: "변동사항 입력 (예: 차량 교체·추가·제외)", max: 300, hideEmpty: true },
  place: { placeholder: "주소 입력" },
  work_start: { suffix: "이후부터 가능" },
  day_off: { placeholder: "차량번호 입력" },
  next_day_off: { placeholder: "차량번호 입력" },
  simul_start: { max: 20 },
  early_plates: { placeholder: "차량번호 입력", max: 300 },
  engine_on: { max: 20 },
  fuel: { max: 30 },
  manager_day: { placeholder: "주간 — 이름/연락처" },
  manager_night: { placeholder: "야간 — 이름/연락처" },
  mount_display: { preset: "기존 위치" },
  mount_main: { placeholder: "설치 위치 직접 입력" },
  mount_board: { placeholder: "설치 위치 직접 입력" },
  mount_alight: { placeholder: "방향 직접 입력" },
  handle_removal: { max: 50 },
  terminal_storage: { placeholder: "예: 배차실, 차고지 창고" },
  notes: { placeholder: "협의 중 나온 특이사항", max: 500 },
  consulter: { placeholder: "이름/연락처" },
};

// 종속 항목 — 부모의 두 번째 선택지를 기준으로 보이거나 숨긴다 (선택지 순서 유지 필요)
//   list_change: list_check 가 두 번째 선택지("변동 있음")일 때만 표시
//   early_plates: simul_start 가 두 번째 선택지("해당없음")이면 숨김(값도 비움)
export const CONSULT_CHILD: Record<string, { parent: string; when: "is" | "not" }> = {
  list_change: { parent: "list_check", when: "is" },
  early_plates: { parent: "simul_start", when: "not" },
};

/** 종속 항목 표시 여부 — 부모가 자유입력(선택지 없음)이면 항상 표시 */
export function childVisible(key: string, fields: ConsultField[], values: Record<string, string | undefined>): boolean {
  const rel = CONSULT_CHILD[key];
  if (!rel) return true;
  const parent = fields.find((f) => f.key === rel.parent);
  const trigger = parent?.enabled ? parent.options?.[1] : undefined; // 부모가 꺼졌으면 항상 표시
  if (!trigger) return true;
  const v = values[rel.parent] ?? "";
  return rel.when === "is" ? v === trigger : v !== trigger;
}

export const DEFAULT_CONSULT_FIELDS: ConsultField[] = [
  { key: "list_check", type: "text", label: "차량리스트·수량 확인", title: "차량리스트 확인", options: ["이상 없음", "변동 있음"], enabled: true },
  { key: "list_change", type: "text", label: "변동사항", enabled: true },
  { key: "place", type: "text", label: "3. 설치 장소", title: "설치 장소", enabled: true },
  { key: "work_start", type: "time", label: "4. 작업 시간 (첫차 운행 종료 시간)", title: "작업 시간", enabled: true },
  { key: "day_off", type: "text", label: "5. 당일 휴차", title: "당일 휴차", enabled: true },
  { key: "next_day_off", type: "text", label: "6. 익일 휴차", title: "익일 휴차", enabled: true },
  { key: "h_run", type: "heading", label: "차량 운행 시간", enabled: true },
  { key: "arrival", type: "time", label: "7. 첫차 운행 종료 후 도착 예정 시간", title: "첫차 종료 후 도착", enabled: true },
  { key: "next_first_bus", type: "time", label: "8. 익일 첫차 출발", title: "익일 첫차 출발", enabled: true },
  { key: "depot_out", type: "time", label: "9. 차고지에서 나가는 시간 (첫차 기준)", title: "차고지 출발(첫차)", enabled: true },
  { key: "simul_start", type: "text", label: "9-1. 동시출발 여부", title: "동시출발 여부", options: ["해당", "해당없음"], enabled: true },
  { key: "early_plates", type: "text", label: "9-2. 사전출발 차량번호", title: "사전출발 차량번호", enabled: true },
  { key: "h_coop", type: "heading", label: "협조·확인사항", enabled: true },
  { key: "key_method", type: "text", label: "10. 차키 협조", title: "차키 협조", options: ["차량 내 보관", "배차실 수령", "직접입력"], enabled: true },
  { key: "engine_on", type: "text", label: "11. 작업 중 차량 시동 가능 여부", title: "작업 중 시동", options: ["가능", "불가능"], enabled: true },
  { key: "fuel", type: "text", label: "12. 확인사항 · 충전 여부", title: "충전 여부", options: ["가스 충분", "부족(에어컨 조절 필요)"], enabled: true },
  { key: "h_mount", type: "heading", label: "담당자·단말기 설치 위치", enabled: true },
  { key: "manager_day", type: "text", label: "13. 운수사 담당자 (주간)", title: "담당자(주간)", enabled: true },
  { key: "manager_night", type: "text", label: "운수사 담당자 (야간)", title: "담당자(야간)", enabled: true },
  { key: "mount_display", type: "text", label: "14. 단말기 설치 위치 — 표출기", title: "표출기", enabled: true },
  { key: "mount_main", type: "text", label: "통합단말기", options: ["운전석 위", "직접입력"], enabled: true },
  { key: "mount_board", type: "text", label: "승차", options: ["격벽 ㄷ봉 사용", "표출기 뒤", "직접입력"], enabled: true },
  { key: "mount_alight", type: "text", label: "하차 (방향)", title: "하차(방향)", options: ["마주보게", "45도", "승객방향", "기존위치", "직접입력"], enabled: true },
  { key: "handle_removal", type: "text", label: "격벽 손잡이(얇은봉) 탈거 유무", title: "격벽 손잡이 탈거", options: ["가능(탈거후 정비과 반납요청)", "불가능"], enabled: true },
  { key: "terminal_storage", type: "text", label: "15. 단말기 보관 위치", title: "단말기 보관 위치", enabled: true },
  { key: "h_notes", type: "heading", label: "특이사항", enabled: true },
  { key: "notes", type: "textarea", label: "16. 특이사항", title: "특이사항", enabled: true },
  { key: "consulter", type: "text", label: "17. 협의자", title: "협의자", enabled: true },
];

export const consultTitle = (f: ConsultField) => (f.title?.trim() || f.label.trim()).replace(/^\d+(-\d+)?\.\s*/, "");

/** 저장된 양식 JSON → 항목 목록. 깨졌거나 없으면 기본 양식. 모르는 키는 버리고, 빠진 키는 끝에 꺼진 채로 붙인다. */
export function parseConsultConfig(raw: string | null): ConsultField[] {
  if (!raw) return DEFAULT_CONSULT_FIELDS.map((f) => ({ ...f }));
  try {
    const r = validateConsultConfig(JSON.parse(raw));
    return typeof r === "string" ? DEFAULT_CONSULT_FIELDS.map((f) => ({ ...f })) : r;
  } catch {
    return DEFAULT_CONSULT_FIELDS.map((f) => ({ ...f }));
  }
}

/** 관리자 PUT 본문 검증 — 통과하면 정리된 목록, 아니면 오류 문구 */
export function validateConsultConfig(body: unknown): ConsultField[] | string {
  if (!Array.isArray(body)) return "양식 형식이 잘못되었습니다.";
  const byKey = new Map(DEFAULT_CONSULT_FIELDS.map((f) => [f.key, f]));
  const out: ConsultField[] = [];
  const seen = new Set<string>();
  for (const it of body as Record<string, unknown>[]) {
    const base = byKey.get(String(it?.key ?? ""));
    if (!base || seen.has(base.key)) continue;
    seen.add(base.key);
    const label = String(it.label ?? "").trim().slice(0, 60);
    if (!label) return `항목명이 비어 있습니다 (${base.key}).`;
    const title = String(it.title ?? "").trim().slice(0, 30);
    const options = Array.isArray(it.options)
      ? [...new Set(it.options.map((o) => String(o).trim().slice(0, 40)).filter(Boolean))].slice(0, 20)
      : [];
    // 키 순서를 기본 양식과 같게 유지 — isDefaultConsultConfig 가 JSON 문자열로 비교한다
    out.push({
      key: base.key,
      type: base.type,
      label,
      ...(title && title !== label ? { title } : {}),
      ...(base.type === "text" && options.length > 0 ? { options } : {}),
      enabled: it.enabled !== false,
    });
  }
  for (const f of DEFAULT_CONSULT_FIELDS) if (!seen.has(f.key)) out.push({ ...f, enabled: false });
  return out;
}

export const isDefaultConsultConfig = (fields: ConsultField[]) =>
  JSON.stringify(fields) === JSON.stringify(DEFAULT_CONSULT_FIELDS);
