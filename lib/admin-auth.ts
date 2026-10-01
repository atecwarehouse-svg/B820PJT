// 관리자 인증 — 단순 비밀번호 + httpOnly 쿠키 게이트(내부용).
// 멀티 프로젝트: 프로젝트마다 비밀번호·쿠키가 다르다.
//   - B820(기본): 환경변수 ADMIN_PASSWORD(미설정 시 기본값), 쿠키 admin_auth — 기존과 동일(기존 쿠키 유효)
//   - 그 외 앨범 프로젝트: 만들 때 정한 비밀번호의 해시(public.projects.admin_password_hash), 쿠키 admin_auth_<slug>
//   - 런처(/projects, /api/projects)는 B820 비밀번호(=마스터)로 잠근다
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { currentSlug, DEFAULT_SLUG, getProject, isDefault } from "@/lib/project";

// 쿠키에는 비밀번호가 아니라 해시를 담는다 — 평문을 넣으면 기기·브라우저 확장·로그를 보는 사람에게
// 비밀번호가 그대로 노출된다. (slug를 앞에 붙여 프로젝트·서비스 간 같은 비밀번호 해시가 겹치지 않게 한다)
export function cookieToken(slug: string, secret: string): string {
  return createHash("sha256").update(`${slug}:${secret}`).digest("hex");
}

export const ADMIN_MAX_AGE = 60 * 30; // 30분

export function adminCookieName(slug: string): string {
  return isDefault(slug) ? "admin_auth" : `admin_auth_${slug}`;
}

/** B820·런처(마스터) 비밀번호 */
export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || "atec1004!!";
}

/** 그 프로젝트의 올바른 쿠키 토큰값. 비밀번호가 없는 프로젝트(레지스트리 없음)는 null. */
export async function expectedAdminToken(slug: string): Promise<string | null> {
  if (isDefault(slug)) return cookieToken(DEFAULT_SLUG, adminPassword());
  const p = await getProject(slug);
  return p?.adminPasswordHash ?? null;
}

// 서버 컴포넌트/route에서 현재 요청이 관리자 인증됐는지 확인. 기본은 현재 프로젝트 기준.
export async function isAdmin(slug: string = currentSlug()): Promise<boolean> {
  const expected = await expectedAdminToken(slug);
  if (!expected) return false;
  const v = cookies().get(adminCookieName(slug))?.value;
  return !!v && v === expected;
}

/** 요청 본문/쿼리로 받은 비밀번호 검증(쿠키 없이 쓰는 API용). 기본은 현재 프로젝트 기준. */
export async function checkAdminPassword(pw: unknown, slug: string = currentSlug()): Promise<boolean> {
  if (typeof pw !== "string" || !pw) return false;
  const expected = await expectedAdminToken(slug);
  return !!expected && cookieToken(slug, pw) === expected;
}

// 진행현황 엑셀 다운로드 비밀번호 — 환경변수 PROGRESS_DOWNLOAD_PASSWORD, 미설정 시 기본값.
// (전 프로젝트 공통)
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

export function progressCookieValue(): string {
  return cookieToken(DEFAULT_SLUG, progressDownloadPassword());
}
