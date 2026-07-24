"use client";

import { useEffect, useState } from "react";

interface WeatherItem {
  label: string; // 예: "인천 서구"
  icon: string;
  text: string;
  temp: number;
  operators: string[]; // 그 구에서 금일 설치하는 운수사들
}

// 홈 화면 우측 상단 날씨 위젯 — 금일(업무일) 설치 예정 운수사 차고지(구/군)별 날씨.
// 계획이 없거나 조회 실패 시 아무것도 표시하지 않는다.
export default function WeatherWidget() {
  const [items, setItems] = useState<WeatherItem[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/weather", { cache: "no-store" });
        const json = await res.json();
        if (alive) setItems((json.list ?? []) as WeatherItem[]);
      } catch {
        // 부가 정보 — 실패 시 숨김
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="absolute right-4 top-3 flex flex-col items-end gap-1">
      {items.map((w) => (
        <div
          key={w.label}
          title={w.operators.join(", ")}
          className="flex items-center gap-1 rounded-full border border-gray-200 bg-white/90 px-2.5 py-1 text-[11px] text-gray-600 shadow-sm"
        >
          <span className="font-medium">{w.label}</span>
          <span>{w.icon}</span>
          <span className="tabular-nums">{w.temp}°</span>
        </div>
      ))}
    </div>
  );
}
