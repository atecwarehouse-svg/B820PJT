// 프로젝트별 기능 켜기/끄기 + 맞춤 값 — 클라이언트·서버 공용 순수 모듈.
// 저장: 각 프로젝트 app_settings `features` = { flags: {키: true/false}, driverEduNote, plateRules } (JSON).
// 저장값이 없으면 종류별 기본값(사진첩은 B820형, 공항 B830(b800air)은 B830형)이라 기존 프로젝트는 그대로 동작한다.
import type { ProjectKind } from "@/lib/project-kind";

export const FEATURES_KEY = "features";

type Def = { key: string; label: string; desc: string; kinds: ProjectKind[]; b820: boolean; b830: boolean };

// b820·b830 = 사진첩 유형별 기본값(체크리스트형은 b820 값을 기본으로 쓴다)
export const FEATURES = [
  { key: "adminCall", label: "관리자 호출", desc: "홈의 관리자 호출 버튼(팀즈 알림)", kinds: ["album"], b820: true, b830: true },
  { key: "dispatch", label: "배차표", desc: "홈의 배차표 버튼 — 차량별 나가는 시간·검수완료·설치제외·타코·모뎀", kinds: ["album"], b820: true, b830: true },
  { key: "voc", label: "운수사 VOC", desc: "홈의 운수사 VOC 버튼", kinds: ["album"], b820: true, b830: true },
  { key: "teamCall", label: "설치팀 호출", desc: "홈의 설치팀 호출(전화) 버튼", kinds: ["album"], b820: true, b830: true },
  { key: "safety", label: "안전관리 서약서", desc: "홈의 안전관리 서약서 메뉴", kinds: ["album"], b820: true, b830: true },
  { key: "teams", label: "설치팀별 확인", desc: "홈의 설치팀별 확인 메뉴", kinds: ["album"], b820: true, b830: true },
  { key: "weather", label: "날씨", desc: "홈 오른쪽 위 작업 시간대 날씨", kinds: ["album"], b820: true, b830: true },
  { key: "bisKakao", label: "BIS·카카오맵 점검 항목", desc: "리포트·운행시작 보고의 인천 BIS·카카오맵(초정밀) 점검란 — 인천 시내버스용", kinds: ["album"], b820: true, b830: false },
  { key: "routeSheet", label: "운수사 배차표 엑셀", desc: "배차표 안 노선별 배차표·당일 배차표 업로드·설치완료 차량 리스트·차고지·운행시작/종료·입차순번 (배차표가 켜져 있어야 함, 아래 차번 규칙 필요)", kinds: ["album"], b820: false, b830: true },
  { key: "dispatchByCompany", label: "배차표 운수사 단위", desc: "배차표에서 영업소(본사·○○영업소)를 나누지 않고 운수사 이름 첫 단어(회사) 단위로 묶어 표시 — 공항버스용", kinds: ["album"], b820: false, b830: true },
  { key: "checkChoices", label: "설치 전 선택 확인 3개", desc: "촬영 1단계의 TV소리·라디오·차량파손 필수 선택(비고 자동 기재)", kinds: ["album"], b820: false, b830: true },
  { key: "paManual", label: "안내방송 결선도", desc: "홈의 안내방송 결선도 버튼(공항 B830 작업지도서)", kinds: ["album"], b820: false, b830: true },
  { key: "statusSheet", label: "현황표", desc: "전체 센터 현황표 버튼", kinds: ["handover", "osupdate"], b820: true, b830: true },
  { key: "verify", label: "검증", desc: "서버 등록 검증(양도양수) / OS 적용 검증(OS업데이트) 버튼", kinds: ["handover", "osupdate"], b820: true, b830: true },
] as const satisfies readonly Def[];

export type FeatureKey = (typeof FEATURES)[number]["key"];
export type Preset = "b820" | "b830";
export interface ProjectCustom {
  flags: Record<FeatureKey, boolean>;
  driverEduNote: string; // 리포트 승무사원 교육 고정 문구(비우면 체크박스)
  plateRules: string; // 배차표 엑셀 차번→차량번호 규칙(줄마다 "회사, 시작~끝, 앞글자, 자릿수"), 비우면 내장 규칙
}

const B830_EDU = "3:30(교육자 출근) 첫차 운행기사부터 교육 예정";
const B830_RULES = [
  "공항리무진, 18~46, 서울75사11, 2",
  "공항리무진, 78~88, 서울71사22, 2",
  "공항리무진, 121~300, 서울70사8, 3",
  "공항리무진, 310~478, 서울71사2, 3",
].join("\n");

export const featuresFor = (kind: ProjectKind) => FEATURES.filter((f) => (f.kinds as readonly string[]).includes(kind));

export function presetCustom(preset: Preset): ProjectCustom {
  return {
    flags: Object.fromEntries(FEATURES.map((f) => [f.key, f[preset]])) as Record<FeatureKey, boolean>,
    driverEduNote: preset === "b830" ? B830_EDU : "",
    plateRules: preset === "b830" ? B830_RULES : "",
  };
}

// 저장값(없거나 깨졌으면 기본값) → 완전한 설정. 새로 생긴 기능 키는 기본값으로 채워진다.
export function resolveCustom(slug: string, raw: string | null | undefined): ProjectCustom {
  const base = presetCustom(slug === "b800air" ? "b830" : "b820");
  if (!raw) return base;
  try {
    return { ...base, ...cleanCustom(JSON.parse(raw), base) };
  } catch {
    return base;
  }
}

// 입력 검증 — 아는 키의 true/false만, 문구·규칙은 길이 제한
export function cleanCustom(input: unknown, base: ProjectCustom = presetCustom("b820")): ProjectCustom {
  const o = (input ?? {}) as Record<string, unknown>;
  const f = (o.flags ?? {}) as Record<string, unknown>;
  return {
    flags: Object.fromEntries(
      FEATURES.map((d) => [d.key, typeof f[d.key] === "boolean" ? (f[d.key] as boolean) : base.flags[d.key]]),
    ) as Record<FeatureKey, boolean>,
    driverEduNote: typeof o.driverEduNote === "string" ? o.driverEduNote.trim().slice(0, 100) : base.driverEduNote,
    plateRules: typeof o.plateRules === "string" ? o.plateRules.trim().slice(0, 4000) : base.plateRules,
  };
}

export type PlateRules = Record<string, [from: number, to: number, prefix: string, digits: number][]>;

// "회사, 시작~끝, 앞글자, 자릿수" 줄들 → 규칙. 형식이 틀린 줄 번호를 함께 돌려준다(저장 전 검증용).
export function parsePlateRules(text: string): { rules: PlateRules; badLines: number[] } {
  const rules: PlateRules = {};
  const badLines: number[] = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const m = /^\s*([^,]+?)\s*,\s*(\d+)\s*[~-]\s*(\d+)\s*,\s*([^,\s]+)\s*,\s*([1-4])\s*$/.exec(line);
    if (!m || +m[2] > +m[3]) return void badLines.push(i + 1);
    (rules[m[1]] ??= []).push([+m[2], +m[3], m[4], +m[5]]);
  });
  return { rules, badLines };
}
