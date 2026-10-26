// 프로젝트 종류 — 클라이언트에서도 쓰는 순수 모듈(lib/project.ts 는 next/headers 를 써서 클라이언트에서 import 불가).
// kind: album = B820 같은 설치 사진첩(자기 스키마+드라이브 폴더), link = 다른 앱 주소 카드,
//       handover = 양도양수 체크리스트(자기 스키마, 드라이브 없음 — lib/handover.ts)
//       osupdate = 단말기 OS업데이트 적용차량 — handover 와 같은 체크리스트 구조 + 시내/마을버스 구분(vehicles.bus_type)
export type ProjectKind = "album" | "link" | "handover" | "osupdate";

export const KIND_LABEL: Record<ProjectKind, string> = {
  album: "앨범 프로젝트",
  handover: "양도양수 체크리스트",
  osupdate: "단말기 OS업데이트 적용차량",
  link: "링크 카드",
};

/** 체크리스트형 프로젝트(handover·osupdate) — 홈=체크리스트, 관리자=HandoverAdmin, 드라이브·사진 없음 */
export const isChecklist = (kind: ProjectKind) => kind === "handover" || kind === "osupdate";
