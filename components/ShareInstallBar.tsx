"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { prefixOf } from "@/components/PLink";

// 프로젝트 홈 오른쪽 위 알약 버튼 두 개 — 작업자에게 이 프로젝트 사진첩을 바로 열 수 있게 공유하는 용도.
//   🔗 링크 복사: 프로젝트 홈 주소(…/p/<slug>, B820은 …/b820)를 공유 시트(모바일) 또는 클립보드로.
//   📲 앱 설치: Android/Chrome은 설치 프롬프트(beforeinstallprompt), iOS는 「공유 → 홈 화면에 추가」 안내.
//              이미 앱(standalone)으로 열었으면 숨긴다. 매니페스트는 프로젝트별(/api/project-manifest)이라 그 프로젝트 홈에서 시작한다.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function ShareInstallBar({ projectName }: { projectName: string }) {
  const pathname = usePathname() ?? "";
  const [toast, setToast] = useState<string | null>(null);
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(true); // SSR에서는 숨김 → 마운트 후 판정
  const [guide, setGuide] = useState<"ios" | "other" | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setStandalone(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const show = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const homeUrl = () => `${window.location.origin}${prefixOf(pathname) || "/b820"}`;

  async function share() {
    const url = homeUrl();
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    try {
      if (nav.share) {
        await nav.share({ title: projectName, text: `${projectName} 설치 사진첩 — 링크를 열고 홈 화면에 추가하세요`, url });
        return;
      }
    } catch {
      /* 공유 취소 → 클립보드로 */
    }
    try {
      await navigator.clipboard.writeText(url);
      show("링크를 복사했습니다");
    } catch {
      window.prompt("이 주소를 복사하세요", url);
    }
  }

  async function install() {
    if (installEvt) {
      await installEvt.prompt();
      const { outcome } = await installEvt.userChoice;
      if (outcome === "accepted") show("설치했습니다. 홈 화면에서 여세요");
      setInstallEvt(null);
      return;
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setGuide(ios ? "ios" : "other");
  }

  return (
    <>
      <div className="absolute right-4 top-3 flex items-center gap-1.5">
        <button type="button" onClick={share} className="pill text-xs">
          🔗 링크 복사
        </button>
        {!standalone && (
          <button type="button" onClick={install} className="pill text-xs">
            📲 앱 설치
          </button>
        )}
      </div>

      {toast && (
        <div className="fixed left-1/2 top-16 z-[70] -translate-x-1/2 rounded-full bg-gray-900/90 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {guide && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setGuide(null)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl motion-safe:animate-rise" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-gray-900">📲 홈 화면에 앱으로 추가</h2>
            {guide === "ios" ? (
              <ol className="mt-3 space-y-2 text-sm leading-relaxed text-gray-600">
                <li>1. Safari 아래(또는 위) <b>공유 버튼</b>(네모에 화살표 ⬆︎)을 누릅니다.</li>
                <li>2. 목록에서 <b>「홈 화면에 추가」</b>를 누릅니다.</li>
                <li>3. 오른쪽 위 <b>「추가」</b>. 홈 화면에 「{projectName}」 아이콘이 생기고, 누르면 이 프로젝트 홈이 바로 열립니다.</li>
                <li className="text-xs text-gray-400">카카오톡·네이버 같은 앱 안 브라우저에서는 안 보일 수 있습니다. 오른쪽 아래 메뉴에서 「Safari로 열기」 후 진행하세요.</li>
              </ol>
            ) : (
              <ol className="mt-3 space-y-2 text-sm leading-relaxed text-gray-600">
                <li>1. 브라우저 메뉴(⋮) 또는 주소창의 <b>설치 아이콘</b>을 누릅니다.</li>
                <li>2. <b>「앱 설치」</b> 또는 <b>「홈 화면에 추가」</b>를 누릅니다.</li>
                <li>3. 홈 화면의 「{projectName}」 아이콘으로 바로 열립니다.</li>
                <li className="text-xs text-gray-400">카카오톡 등 앱 안 브라우저라면 「다른 브라우저로 열기」(Chrome) 후 진행하세요.</li>
              </ol>
            )}
            <button type="button" onClick={() => setGuide(null)} className="mt-4 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white active:bg-blue-700">
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
}
