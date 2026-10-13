"use client";

import type { ReactNode } from "react";

// 완료 팝업 — 프로젝트 생성·삭제처럼 "끝났다"를 확실히 보여 주는 전체화면 모달.
// 동그라미가 튀어나오고(animate-pop) 체크/휴지통 선이 그려진다(animate-draw). 버튼은 이동(링크) 또는 닫기.
export interface DoneAction {
  label: string;
  href?: string; // 있으면 <a>(프로젝트 홈 등 접두사 포함 절대 경로)
  onClick?: () => void;
  primary?: boolean;
}

export default function DonePopup({
  tone,
  title,
  children,
  actions,
  onClose,
}: {
  tone: "success" | "delete";
  title: string;
  children?: ReactNode; // 설명 줄들
  actions: DoneAction[];
  onClose: () => void;
}) {
  const ring = tone === "success" ? "bg-emerald-500 shadow-emerald-200" : "bg-rose-500 shadow-rose-200";
  const primary = tone === "success" ? "bg-emerald-600 active:bg-emerald-700" : "bg-rose-600 active:bg-rose-700";
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-5 motion-safe:animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl motion-safe:animate-rise"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-live="polite"
      >
        <span className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg motion-safe:animate-pop ${ring}`}>
          <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            {tone === "success" ? (
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray={60} className="motion-safe:animate-draw" />
            ) : (
              <>
                <path d="M4 7h16" strokeDasharray={60} className="motion-safe:animate-draw" />
                <path d="M9 7V4.5h6V7M6.5 7l1 13h9l1-13" strokeDasharray={60} className="motion-safe:animate-draw" />
              </>
            )}
          </svg>
        </span>
        <h2 className="mt-4 text-lg font-bold text-gray-900">{title}</h2>
        {children && <div className="mt-2 space-y-1 text-sm leading-relaxed text-gray-500">{children}</div>}
        <div className="mt-5 grid gap-2">
          {actions.map((a) =>
            a.href ? (
              <a
                key={a.label}
                href={a.href}
                className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-sm ${a.primary ? `${primary} text-white` : "bg-white text-gray-700 ring-1 ring-black/5 active:bg-gray-100"}`}
              >
                {a.label}
              </a>
            ) : (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick ?? onClose}
                className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-sm ${a.primary ? `${primary} text-white` : "bg-white text-gray-700 ring-1 ring-black/5 active:bg-gray-100"}`}
              >
                {a.label}
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
