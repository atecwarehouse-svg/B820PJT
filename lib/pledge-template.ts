// 안전관리 서약서 양식 — 프로젝트별(app_settings.safety_pledge). 서버·클라이언트 공용(순수 함수만).
// 기준양식 = "버스단말기설치 양식"(B820 워드 양식 원문). 없거나 깨졌으면 기준양식.
//   title     : 서약서 제목. 비우면 자동(B820=기준 제목, 그 외 "<프로젝트명> 안전관리 서약서")
//   company   : 회사명(설치사)
//   eduItems  : [교육내용] 1~N (1~20개, 각 1~300자)
//   pledgeText: 2페이지 하단 서약 문구

export interface PledgeTemplate {
  title: string;
  company: string;
  eduItems: string[];
  pledgeText: string;
}

export const PLEDGE_BASE_NAME = "버스단말기설치 양식"; // 기준양식 이름(화면 표기)
export const PLEDGE_TITLE = "인천버스 단말기 설치 안전관리 서약서"; // B820 기준 제목

export const DEFAULT_PLEDGE_TEMPLATE: PledgeTemplate = {
  title: "",
  company: "에이텍모빌리티",
  eduItems: [
    "작업 시작 전에 현장에 잠재한 위험 요소를 사전 평가하고, 필요한 안전 조치를 취해야 합니다.",
    "사용되는 기계 및 장비가 정상 작동하는지, 고장이나 결함이 없는지 사전 점검이 필수적입니다.",
    "모든 근로자는 작업에 적합한 개인 보호장비(헬멧, 안전화, 안전벨트 등)를 반드시 착용해야 하며, 장비가 제대로 장착되었는지 확인해야 합니다.",
    "정해진 작업 절차와 순서를 반드시 따라야 하며, 위험 요소를 줄이기 위한 예방 조치를 준수해야 합니다.",
    "고소 작업 시 안전벨트 착용, 작업대와의 적절한 고정, 비상 대피 경로 확보 등 필수 조치를 반드시 시행해야 합니다.",
    "기계 작동 중에 근로자가 접근하거나 수리 작업을 하지 않도록 주의해야 하며, 필요한 경우 기계를 완전히 정지시키고 작업을 진행해야 합니다.",
    "작업이 끝난 후에도 현장 점검을 실시하여 위험 요소가 남아 있지 않은지 확인하고, 필요한 경우 작업 일지에 기록을 남겨야 합니다.",
    "작업 중 통행로가 막히지 않도록 바닥을 정리하고, 사고를 유발할 수 있는 장애물이나 미끄러운 바닥을 주기적으로 점검하여 위험을 최소화해야 합니다.",
  ],
  pledgeText:
    "상기 주의사항을 충분히 이해하고 인식하였으며, 이를 성실히 준수할 것을 서약합니다. " +
    "이에 따라 모든 안전 수칙을 준수하고, 중대재해 예방을 위한 의무를 다할 것을 서명으로 확인합니다.",
};

/** 입력(JSON 객체) 검증 → PledgeTemplate. 문제가 있으면 사유 문자열. */
export function validatePledgeTemplate(v: unknown): PledgeTemplate | string {
  if (!v || typeof v !== "object") return "형식이 잘못되었습니다.";
  const o = v as Partial<PledgeTemplate>;
  const title = String(o.title ?? "").trim();
  const company = String(o.company ?? "").trim();
  const pledgeText = String(o.pledgeText ?? "").trim();
  if (title.length > 60) return "제목은 60자 이하로 입력하세요.";
  if (!company || company.length > 40) return "회사명은 1~40자로 입력하세요.";
  if (!pledgeText || pledgeText.length > 500) return "서약 문구는 1~500자로 입력하세요.";
  if (!Array.isArray(o.eduItems)) return "교육내용 목록이 없습니다.";
  const eduItems = o.eduItems.map((s) => String(s ?? "").trim());
  if (eduItems.length < 1 || eduItems.length > 20) return "교육내용은 1~20개여야 합니다.";
  const bad = eduItems.findIndex((s) => !s || s.length > 300);
  if (bad >= 0) return `교육내용 ${bad + 1}번은 1~300자로 입력하세요.`;
  return { title, company, eduItems, pledgeText };
}

/** 저장값 → PledgeTemplate. 없거나 깨졌으면 기준양식. */
export function parsePledgeTemplate(raw: string | null): PledgeTemplate {
  if (!raw) return DEFAULT_PLEDGE_TEMPLATE;
  try {
    const t = validatePledgeTemplate(JSON.parse(raw));
    return typeof t === "string" ? DEFAULT_PLEDGE_TEMPLATE : t;
  } catch {
    return DEFAULT_PLEDGE_TEMPLATE;
  }
}

export function isDefaultPledgeTemplate(t: PledgeTemplate): boolean {
  return JSON.stringify(t) === JSON.stringify(DEFAULT_PLEDGE_TEMPLATE);
}

/** PDF 제목 — 양식에 제목이 있으면 그것, 없으면 B820=기준 제목 / 그 외 "<프로젝트명> 안전관리 서약서" */
export function pledgeTitleFor(t: PledgeTemplate, projectName: string, isB820: boolean): string {
  return t.title || (isB820 ? PLEDGE_TITLE : `${projectName} 안전관리 서약서`);
}
