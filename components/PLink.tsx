"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

// 프로젝트 접두사를 아는 Link. 브라우저 주소가 /p/<slug>/… 이면(비기본 프로젝트)
// 앱 안의 절대 경로 href("/dashboard" 등)에 같은 접두사를 붙인다. B820(접두사 없음)은 그대로.
// 서버 컴포넌트·클라이언트 컴포넌트 어디서든 next/link 대신 import 해서 쓰면 된다.

export const PREFIX_RE = /^\/p\/[a-z][a-z0-9_]{1,19}(?=\/|$)/;

/** 현재 경로의 프로젝트 접두사("/p/<slug>") — 없으면 "" */
export function prefixOf(pathname: string): string {
  const m = PREFIX_RE.exec(pathname);
  return m ? m[0] : "";
}

/** href에 접두사 적용. 런처(/, /projects)·API·이미 접두사 있는 경로는 그대로. "/b820"(프로젝트 홈)은 접두사 자체로. */
export function withPrefix(prefix: string, href: string): string {
  if (!prefix || !href.startsWith("/") || href.startsWith("//")) return href;
  if (
    href === "/" ||
    href === "/projects" ||
    href.startsWith("/projects/") ||
    href.startsWith("/projects?") ||
    href.startsWith("/api/") ||
    href.startsWith("/p/")
  ) {
    return href;
  }
  if (href === "/b820" || href.startsWith("/b820?")) return prefix + href.slice("/b820".length);
  return prefix + href;
}

/** 클라이언트 코드(router.push, window.location)용 */
export function clientProjectPath(href: string): string {
  if (typeof window === "undefined") return href;
  return withPrefix(prefixOf(window.location.pathname), href);
}

export default function PLink(props: ComponentProps<typeof Link>) {
  const pathname = usePathname() ?? "";
  const { href, ...rest } = props;
  const h = typeof href === "string" ? withPrefix(prefixOf(pathname), href) : href;
  return <Link href={h} {...rest} />;
}
