// 관리자 인증 — 단순 비밀번호 + httpOnly 쿠키 게이트(내부용).
// 비밀번호는 환경변수 ADMIN_PASSWORD, 미설정 시 기본값 사용.
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "admin_auth";
export const ADMIN_MAX_AGE = 60 * 60 * 12; // 12시간

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || "atec1004!!";
}

// 진행현황 엑셀 다운로드 비밀번호 — 환경변수 PROGRESS_DOWNLOAD_PASSWORD, 미설정 시 기본값.
export function progressDownloadPassword(): string {
  return process.env.PROGRESS_DOWNLOAD_PASSWORD || "wktks2020!!";
}

// 대시보드 상세(설치 일정·운수사별·영업소별·날짜별) 잠금 해제 쿠키.
// 진행현황 다운로드와 같은 비밀번호를 쓴다.
export const PROGRESS_COOKIE = "progress_unlock";
export const PROGRESS_MAX_AGE = 60 * 60 * 12; // 12시간

export function isProgressUnlocked(): boolean {
  const v = cookies().get(PROGRESS_COOKIE)?.value;
  return !!v && v === progressDownloadPassword();
}

// 서버 컴포넌트/route에서 현재 요청이 관리자 인증됐는지 확인.
export function isAdmin(): boolean {
  const v = cookies().get(ADMIN_COOKIE)?.value;
  return !!v && v === adminPassword();
}
