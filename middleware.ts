import { NextRequest, NextResponse } from "next/server";

// 멀티 프로젝트 주소 처리.
//   /p/<slug>/<rest>  → <rest> 로 rewrite + 요청 헤더 x-project: <slug>  (페이지·API 공통, 메서드·바디 보존)
//   /p/<slug>         → /b820 (프로젝트 홈 페이지 파일은 하나)
//   /p/b820/...       → 접두사 없는 정규 주소로 리다이렉트 (B820은 접두사 없이 쓴다)
//   접두사 없는 요청: Referer가 /p/<slug>/… 페이지면 그 프로젝트로 본다
//     - 문서 요청(링크 클릭·주소 입력)이고 프로젝트 페이지면 /p/<slug>/… 로 리다이렉트 (주소창 유지)
//     - 그 외(API fetch·RSC 프리페치 등)는 x-project 헤더만 붙여 통과 → 77곳의 fetch("/api/…") 무변경
//   들어온 x-project 헤더는 항상 버린다(스푸핑 방지).

export const config = {
  matcher: ["/((?!_next/|icons/|icon$|apple-icon$|manifest\\.webmanifest$|favicon\\.ico$).*)"],
};

const DEFAULT = "b820";
const PREFIX = /^\/p\/([a-z][a-z0-9_]{1,19})(\/.*)?$/;
const PROJECT_PAGES = /^\/(b820|dashboard|list|safety|teams|admin|about|record|print)(\/|$)/;
const LAUNCHER = /^\/(projects(\/.*)?)?$/; // "/", "/projects…" — 런처(프로젝트 무관)

function refererSlug(req: NextRequest): string | null {
  const ref = req.headers.get("referer");
  if (!ref) return null;
  try {
    // 교차 출처 Referer는 기본 정책상 경로 없이 origin만 오므로 /p/ 접두사가 잡히지 않는다
    const m = PREFIX.exec(new URL(ref).pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
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
    const dest = !rest || rest === "/" || rest === "/b820" ? "/b820" : rest;
    h.set("x-project", slug);
    return NextResponse.rewrite(new URL(dest + search, req.url), { request: { headers: h } });
  }

  const ref = refererSlug(req);
  if (ref && ref !== DEFAULT && !LAUNCHER.test(pathname)) {
    const isDocument = req.method === "GET" && req.headers.get("sec-fetch-dest") === "document";
    if (isDocument && PROJECT_PAGES.test(pathname)) {
      const rest = pathname === "/b820" ? "" : pathname;
      return NextResponse.redirect(new URL(`/p/${ref}${rest}${search}`, req.url), 307);
    }
    h.set("x-project", ref);
  }
  return NextResponse.next({ request: { headers: h } });
}
