// 관리자 인증 — 단순 비밀번호 + httpOnly 쿠키 게이트(내부용).
// 비밀번호는 환경변수 ADMIN_PASSWORD, 미설정 시 기본값 사용.
import { createHash } from "node:crypto";
import { cookies } from "next/headers";

// 쿠키에는 비밀번호가 아니라 해시를 담는다 — 예전처럼 평문을 넣으면
// 기기·브라우저 확장·로그를 보는 사람에게 비밀번호가 그대로 노출된다.
// (해시 앞에 앱 고유 문자열을 붙여 다른 서비스의 같은 비밀번호 해시와 겹치지 않게 한다)
function cookieToken(secret: string): string {
  return createHash("sha256").update(`b820:${secret}`).digest("hex");
}

export const ADMIN_COOKIE = "admin_auth";
export const ADMIN_MAX_AGE = 60 * 30; // 30분

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
export const PROGRESS_MAX_AGE = 60 * 30; // 30분

export function isProgressUnlocked(): boolean {
  const v = cookies().get(PROGRESS_COOKIE)?.value;
  return !!v && v === progressCookieValue();
}

// 서버 컴포넌트/route에서 현재 요청이 관리자 인증됐는지 확인.
export function isAdmin(): boolean {
  const v = cookies().get(ADMIN_COOKIE)?.value;
  return !!v && v === adminCookieValue();
}

// 로그인 성공 시 쿠키에 넣을 값 (비밀번호 자체가 아니라 해시).
// 비밀번호를 바꾸면 기존 쿠키는 자동으로 무효가 된다.
export function adminCookieValue(): string {
  return cookieToken(adminPassword());
}

export function progressCookieValue(): string {
  return cookieToken(progressDownloadPassword());
}
