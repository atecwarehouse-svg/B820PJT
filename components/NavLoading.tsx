"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import LoadingOverlay from "@/components/LoadingOverlay";

// 페이지 이동 로딩 — 앱 안 링크(<a href>)를 누르면 오버레이를 띄우고, 주소가 바뀌면(또는 전체 새로고침으로 문서가 바뀌면) 내린다.
//   · 150ms 안에 끝나는 이동(캐시된 화면)은 오버레이를 띄우지 않아 깜빡이지 않는다
//   · 새 탭·외부 링크·다운로드·#앵커·수정키(ctrl/⌘) 클릭은 제외
//   · router.push 같은 코드 이동은 window.dispatchEvent(new Event(NAV_LOADING_EVENT))로 띄울 수 있다
//   · 혹시 주소가 안 바뀌는 이동(같은 페이지)이면 8초 뒤 자동으로 내린다
export const NAV_LOADING_EVENT = "nav-loading";
/** router.push 직전에 호출 — 이동 오버레이를 띄운다 */
export function navLoading(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NAV_LOADING_EVENT));
}

export default function NavLoading() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [show, setShow] = useState(false);
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; fallback?: ReturnType<typeof setTimeout> }>({});

  const clear = () => {
    clearTimeout(timers.current.delay);
    clearTimeout(timers.current.fallback);
  };

  useEffect(() => {
    const start = () => {
      clear();
      timers.current.delay = setTimeout(() => setShow(true), 150);
      timers.current.fallback = setTimeout(() => setShow(false), 8000);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // 같은 화면(#앵커 등)
      start();
    };
    const onEvent = () => start();
    document.addEventListener("click", onClick, true);
    window.addEventListener(NAV_LOADING_EVENT, onEvent);
    return () => {
      clear();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(NAV_LOADING_EVENT, onEvent);
    };
  }, []);

  // 주소가 바뀌면(이동 완료) 내린다 — 아직 안 뜬 지연 타이머도 함께 취소
  useEffect(() => {
    clear();
    setShow(false);
  }, [pathname, search]);

  return show ? <LoadingOverlay label="이동 중…" /> : null;
}
