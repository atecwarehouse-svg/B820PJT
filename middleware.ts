import { NextRequest, NextResponse } from "next/server";

// 멀티 프로젝트 주소 처리.
//   /p/<slug>/<rest>  → <rest> 로 rewrite + 요청 헤더 x-project: <slug>  (페이지·API 공통, 메서드·바디 보존)
//   /p/<slug>         → /b820 (프로젝트 홈 페이지 파일은 하나)
//   /p/b820/...       → 접두사 없는 정규 주소로 리다이렉트 (B820은 접두사 없이 쓴다)
//   접두사 없는 요청: Referer가 /p/<slug>/… 페이지면 그 프로젝트로 본다
//     - 화면 이동(문서 요청·Next 클라이언트 내비게이션)이고 프로젝트 페이지면 /p/<slug>/… 로 리다이렉트 (주소창 유지)
//     - 그 외(API fetch 등)는 x-project 헤더만 붙여 통과 → 77곳의 fetch("/api/…") 무변경
//     - Referer가 아예 없는 API 호출(리퍼러 차단 환경)은 마지막으로 본 프로젝트 쿠키(pj)로 판별
//   들어온 x-project 헤더는 항상 버린다(스푸핑 방지).

export const config = {
  matcher: ["/((?!_next/|icons/|icon$|apple-icon$|manifest\\.webmanifest$|favicon\\.ico$).*)"],
};

const DEFAULT = "b820";
const PREFIX = /^\/p\/([a-z][a-z0-9_]{1,19})(\/.*)?$/;
const PROJECT_PAGES = /^\/(b820|dashboard|list|safety|teams|admin|record|print)(\/|$)/;
const LAUNCHER = /^\/(projects(\/.*)?|help)?$/; // "/", "/projects…", "/help" — 런처(프로젝트 무관)
const COOKIE = "pj"; // 마지막으로 연 프로젝트 — Referer 없는 API 호출의 폴백
const RESERVED = new Set(["public", "graphql_public", "storage", "auth", "extensions"]);

function refererSlug(req: NextRequest): string | null | undefined {
  const ref = req.headers.get("referer");
  if (!ref) return undefined; // Referer 자체가 없음
  try {
    // 교차 출처 Referer는 기본 정책상 경로 없이 origin만 오므로 /p/ 접두사가 잡히지 않는다
    const m = PREFIX.exec(new URL(ref).pathname);
    return m ? m[1] : null; // null = 접두사 없는 페이지(B820)에서 온 요청
  } catch {
    return null;
  }
}

// 화면 이동 요청인가 — 문서 요청, Next 클라이언트 내비게이션(RSC), Fetch Metadata가 없는 구형 브라우저의 HTML 요청
function isNavigation(req: NextRequest): boolean {
  if (req.method !== "GET") return false;
  const dest = req.headers.get("sec-fetch-dest");
  if (dest === "document") return true;
  if (req.headers.get("RSC") === "1") return true;
  return dest === null && (req.headers.get("accept") ?? "").includes("text/html");
}

function withProjectCookie(res: NextResponse, slug: string): NextResponse {
  res.cookies.set(COOKIE, slug, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  return res;
}

export function middleware(req: NextRequest) {
  const h = new Headers(req.headers);
  h.delete("x-project");
  const { pathname, search } = req.nextUrl;

  const m = PREFIX.exec(pathname);
  if (m) {
    const slug = m[1];
    const rest = m[2] ?? "";
    if (slug === DEFAULT) {
      const dest = !rest || rest === "/" ? "/b820" : rest;
      return NextResponse.redirect(new URL(dest + search, req.url), 307);
    }
    if (RESERVED.has(slug)) return NextResponse.json({ error: "not found" }, { status: 404 });
    const dest = !rest || rest === "/" || rest === "/b820" ? "/b820" : rest;
    h.set("x-project", slug);
    const res = NextResponse.rewrite(new URL(dest + search, req.url), { request: { headers: h } });
    return isNavigation(req) ? withProjectCookie(res, slug) : res;
  }

  const ref = refererSlug(req);
  if (!LAUNCHER.test(pathname)) {
    if (ref && ref !== DEFAULT) {
      if (isNavigation(req) && PROJECT_PAGES.test(pathname)) {
        const rest = pathname === "/b820" ? "" : pathname;
        return NextResponse.redirect(new URL(`/p/${ref}${rest}${search}`, req.url), 307);
      }
      h.set("x-project", ref);
      return NextResponse.next({ request: { headers: h } });
    }
    if (ref === undefined && pathname.startsWith("/api/")) {
      // Referer 없는 API 호출 — 마지막으로 연 프로젝트 쿠키로 판별 (B820 페이지를 열면 쿠키도 b820으로 돌아간다)
      const c = req.cookies.get(COOKIE)?.value ?? "";
      if (c && c !== DEFAULT && PREFIX.test(`/p/${c}`) && !RESERVED.has(c)) {
        h.set("x-project", c);
        return NextResponse.next({ request: { headers: h } });
      }
    }
  }
  const res = NextResponse.next({ request: { headers: h } });
  // 접두사 없는 화면(B820·런처)을 열면 쿠키를 B820으로 되돌린다
  return isNavigation(req) && req.cookies.get(COOKIE)?.value && req.cookies.get(COOKIE)?.value !== DEFAULT
    ? withProjectCookie(res, DEFAULT)
    : res;
}
