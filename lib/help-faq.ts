// 사용법 도우미의 질문·답변 사전 — 클라이언트·서버 공용 순수 모듈.
// 저장: 기본 프로젝트(public) app_settings `help_faq` = [{ q, a }] (JSON, 모든 프로젝트 공용). 저장값이 없으면 아래 기본 목록.
export const HELP_FAQ_KEY = "help_faq";
// 자동 학습: AI가 답한 질문은 { auto: true }로 사전에 쌓인다(다음부터는 AI 없이 바로 답). 관리자가 사전 편집에서 고치면 auto가 풀린다.
// AI도 답하지 못한 질문은 `help_missed`(글자 목록)에 쌓여 사전 편집 화면 위에 보인다.
export const HELP_MISSED_KEY = "help_missed";
export interface Faq {
  q: string;
  a: string;
  auto?: boolean;
}
export const cleanMissed = (input: unknown): string[] =>
  Array.isArray(input) ? [...new Set(input.map((x) => String(x ?? "").trim().slice(0, 200)).filter(Boolean))].slice(-50) : [];

export const DEFAULT_FAQ: Faq[] = [
  { q: "새 프로젝트는 어떻게 만들어?", a: "첫 화면(프로젝트 선택) → 프로젝트 관리 → '새 프로젝트'에서 종류(앨범·양도양수·OS업데이트·링크 카드)를 고르고 이름·ID·관리자 비밀번호를 넣습니다. 사진첩은 '기능 선택'에서 B820형/B830형을 고르면 기본 구성이 채워지고, 체크박스로 기능을 하나씩 켜고 끌 수 있습니다." },
  { q: "프로젝트 기능을 켜고 끄려면?", a: "첫 화면 → 프로젝트 관리 → 해당 프로젝트의 연필(수정) → '기능 선택'에서 체크박스를 바꾸고 저장합니다. 끄면 홈의 버튼·메뉴가 사라집니다." },
  { q: "차량 리스트(전개현황 엑셀)는 어디서 올려?", a: "프로젝트 홈 → 진행 현황(대시보드)에서 일정 업로드로 올립니다. 빈 양식의 '차량리스트' 시트에 운수사(B)·노선(C)·차량번호(F)는 필수, 차고지(D)·설치 예정일(K)은 권장입니다." },
  { q: "배차표 엑셀은 어디서 올려?", a: "프로젝트 홈 → 배차표 → '노선별 배차표 (운수사 엑셀)' → 엑셀 업로드. 파일 안 날짜로 저장되고, 저장 문구에 '노선 N개 · 차량 N대 읽음'이 나옵니다. ('운수사 배차표 엑셀' 기능이 켜진 프로젝트만)" },
  { q: "당일 배차표는 어디서 올려?", a: "프로젝트 홈 → 배차표에서 운수사·날짜를 고른 뒤 '당일 배차표 업로드 (운행종료 시간 · 캡쳐용)'. 캡쳐용 표에 운행종료와 입차순번이 나옵니다." },
  { q: "운행종료 시간은 어떻게 계산돼?", a: "당일 배차표에서 그 차량의 마지막 T1 출발 시간에 2시간을 더한 값입니다. 여러 노선에 나오는 차량은 더 늦은 T1 출발을 기준으로 합니다." },
  { q: "입차순번은 어떻게 정해져?", a: "캡쳐용 표에 나온 차량 중 운행종료가 빠른 순서대로 1번부터 매깁니다. 같은 시간은 같은 순번이고, 자정을 넘긴 차량은 가장 늦은 순번입니다." },
  { q: "운행시작(나가는 시간)이 자동으로 들어가는 기준은?", a: "노선별 배차표 엑셀이 올라와 있으면, 설치일 다음 날 배차표에서 그 차량의 첫 출발 시간(04~09시)을 가져옵니다. 손으로 넣은 시간이 있으면 그 시간이 우선입니다." },
  { q: "설치완료 차량 리스트를 이미지로 저장하려면?", a: "프로젝트 홈 → 배차표 → '설치완료 차량 리스트 (캡쳐용)' → 오른쪽 위 '이미지 저장'. 폰에서는 공유 창이 떠서 갤러리 저장이나 메신저 전송을 고를 수 있습니다." },
  { q: "설치완료 리스트의 시간·출발지를 고치려면?", a: "설치완료 차량 리스트에서 그 차량 줄을 누르면 수정 창이 뜹니다. 저장하면 바로 반영되고, '원래대로'를 누르면 엑셀 값으로 돌아갑니다." },
  { q: "차번을 차량번호로 바꾸는 규칙은 어디서 바꿔?", a: "프로젝트 관리 → 프로젝트 수정 → '기능 선택' 아래 '배차표 엑셀 차번 → 차량번호 규칙'에 한 줄에 하나씩 '회사, 시작~끝, 앞글자, 자릿수' 형식으로 적습니다. 예) 공항리무진, 121~300, 서울70사8, 3" },
  { q: "설치팀은 어디서 등록해?", a: "프로젝트 홈 → 관리자 → '설치팀' 탭에서 팀명·이름·전화를 등록합니다. 촬영 화면의 팀 선택과 설치팀 호출에 쓰입니다." },
  { q: "완료 리포트 메일 받는 사람은 어디서 바꿔?", a: "프로젝트 홈 → 관리자 → '메일 수신자' 탭에서 주소를 넣습니다. 비어 있으면 메일 발송이 막힙니다." },
  { q: "사진 양식(촬영 칸)은 어디서 바꿔?", a: "프로젝트 홈 → 관리자 → '사진 양식' 탭에서 설치 전 특이사항·설치 전·설치 후 칸을 편집합니다." },
  { q: "서약서 양식은 어디서 바꿔?", a: "프로젝트 홈 → 관리자 → '서약서 양식' 탭에서 제목·회사명·교육내용을 바꿉니다. 안 바꾸면 기준 양식(버스단말기설치)입니다." },
  { q: "차량을 삭제하려면?", a: "프로젝트 홈 → 관리자 → '차량 삭제' 탭에서 차량번호를 찾아 삭제합니다. 사진과 드라이브 폴더까지 지워지니 주의하세요." },
];

export function parseFaq(raw: string | null | undefined): Faq[] {
  try {
    const list = cleanFaq(JSON.parse(raw ?? ""));
    return list.length ? list : DEFAULT_FAQ;
  } catch {
    return DEFAULT_FAQ;
  }
}

// 입력 검증 — 질문·답변이 모두 있는 항목만, 길이·개수 제한
export function cleanFaq(input: unknown): Faq[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x): Faq => ({
      q: String(x?.q ?? "").trim().slice(0, 200),
      a: String(x?.a ?? "").trim().slice(0, 2000),
      ...(x?.auto === true ? { auto: true } : {}),
    }))
    .filter((x) => x.q && x.a)
    .slice(0, 200);
}

// 질문 비슷한 정도(0~1) — 띄어쓰기·기호를 뺀 글자 2개 묶음이 얼마나 겹치는지.
// ponytail: 단순 글자 겹침 — 표현이 많이 다르면 못 찾는다(그때는 AI가 사전을 근거로 답함). 필요하면 임베딩 검색으로.
// 질문마다 붙는 말은 빼고 핵심 낱말만 비교한다 — 안 빼면 '메일 양식은 어디서 바꿔'가 '서약서 양식은 어디서 바꿔'에 걸린다
const FILLER = /어디서|어디에서|어디|어떻게|하려면|바꾸[가-힣]*|바꿔|알려\s*줘|방법|뭐야|인가요|하나요/g;
const grams = (s: string) => {
  const t = s.toLowerCase().replace(FILLER, "").replace(/[^0-9a-z가-힣]/g, "");
  return new Set(Array.from({ length: Math.max(t.length - 1, 0) }, (_, i) => t.slice(i, i + 2)));
};
export function similarity(a: string, b: string): number {
  const x = grams(a);
  const y = grams(b);
  if (!x.size || !y.size) return 0;
  let hit = 0;
  for (const g of x) if (y.has(g)) hit++;
  // 양쪽 기준 겹침의 평균 — 한쪽만 보면 '…은 어디서 바꿔?' 같은 공통 꼬리만으로 다른 질문에 걸린다
  return (hit / x.size + hit / y.size) / 2;
}

export const FAQ_MATCH = 0.7; // 이 이상 겹치면 사전 답을 그대로 쓴다
export function bestFaq(list: Faq[], question: string): { faq: Faq; score: number } | null {
  let best: { faq: Faq; score: number } | null = null;
  for (const faq of list) {
    const score = similarity(question, faq.q);
    if (!best || score > best.score) best = { faq, score };
  }
  return best;
}
