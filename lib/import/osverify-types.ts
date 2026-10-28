// OS업데이트 검증 파일 종류·라벨·규칙 설명 — 클라이언트에서도 쓰는 순수 모듈(parse-osverify.ts 는 xlsx 를 끌고 오므로 분리)
/** 검증 전담 작업자의 센터명 — 작업자 명단에 센터를 이 이름으로 등록하면 홈이 체크리스트 대신 검증 화면(업로드·현황 엑셀·발송)으로 열린다 */
export const VERIFIER_CENTER = "검증";

export const OS_FILE_TYPES = ["fault", "b710", "b700", "b800"] as const;
export type OsFileType = (typeof OS_FILE_TYPES)[number];
export const OS_FILE_LABEL: Record<OsFileType, string> = {
  fault: "장애목록(자산등록)",
  b710: "B710 OS버전",
  b700: "B700 OS버전",
  b800: "B800 OS버전",
};
/** 완료 조건(설명용) */
export const OS_RULE_TEXT: Record<OsFileType, string> = {
  fault: "접수오류유형 기타 · 현장처리유형 F/W, OS 적용 · 처리내용에 'OS 업데이트'",
  b710: "AFC보드 32/32 · BMS보드 32/32",
  b700: "AFC 램디스크 40 · 커널 39 · BMS 램디스크 40 · 커널 39",
  b800: "AFC 램디스크 19 · 커널 19 · BMS 램디스크 19 · 커널 19",
};
