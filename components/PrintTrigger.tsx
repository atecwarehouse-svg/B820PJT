"use client";

import { useEffect } from "react";

// 인쇄 페이지 진입 시 이미지 로드를 기다린 뒤 인쇄 대화상자 자동 실행.
export default function PrintTrigger() {
  useEffect(() => {
    let done = false;
    const trigger = () => {
      if (done) return;
      done = true;
      window.print();
    };
    // 이미지 로딩 완료 대기 (최대 2.5초)
    if (document.readyState === "complete") {
      setTimeout(trigger, 600);
    } else {
      window.addEventListener("load", () => setTimeout(trigger, 600), { once: true });
    }
    const fallback = setTimeout(trigger, 2500);
    return () => clearTimeout(fallback);
  }, []);
  return null;
}
