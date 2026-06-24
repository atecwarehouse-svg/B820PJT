// 관리자 인증 — 단순 비밀번호 + httpOnly 쿠키 게이트(내부용).
// 비밀번호는 환경변수 ADMIN_PASSWORD, 미설정 시 기본값 사용.
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "admin_auth";
export const ADMIN_MAX_AGE = 60 * 60 * 12; // 12시간

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || "atec1004!!";
}

// 서버 컴포넌트/route에서 현재 요청이 관리자 인증됐는지 확인.
export function isAdmin(): boolean {
  const v = cookies().get(ADMIN_COOKIE)?.value;
  return !!v && v === adminPassword();
}
