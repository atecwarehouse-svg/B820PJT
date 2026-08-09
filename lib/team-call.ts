import type { InstallTeam } from "@/lib/settings";

// 설치팀 전화 걸기 공용 — 홈 '설치팀 호출' 버튼과 배차표 행의 📞 버튼이 함께 쓴다.

export const telHref = (phone: string) =>
  `tel:${phone.replace(/[^0-9+]/g, "")}`;

/** 설치팀 연락처 목록. 관리자 로그인 쿠키가 없으면 비밀번호를 묻는다.
 *  취소하거나 비밀번호가 틀리면 null(호출한 쪽은 그냥 중단). */
export async function loadTeamContacts(): Promise<InstallTeam[] | null> {
  const get = async (pw: string) => {
    const res = await fetch(`/api/team-phones?pw=${encodeURIComponent(pw)}`, {
      cache: "no-store",
    });
    if (res.status === 401) return "unauthorized" as const;
    const j = await res.json();
    return Array.isArray(j.list) ? (j.list as InstallTeam[]) : [];
  };
  let list = await get("");
  if (list === "unauthorized") {
    const pw = window.prompt("관리자 비밀번호를 입력하세요.");
    if (!pw) return null;
    list = await get(pw);
    if (list === "unauthorized") {
      alert("비밀번호가 올바르지 않습니다.");
      return null;
    }
  }
  return list;
}
