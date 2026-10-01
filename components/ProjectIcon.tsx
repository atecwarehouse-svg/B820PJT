// 프로젝트 선택 화면의 아이콘·카드 색 — 이모지 대신 선 아이콘(Lucide 경로, ISC 라이선스).
// 아이콘 키(bus·folder…)와 색 키(blue·teal…)는 DB(app_settings.projects[])에 저장된다.
// Tailwind는 클래스 문자열을 정적으로 찾으므로 색 클래스는 조합하지 말고 여기 완성형으로 둔다.

export const PROJECT_ICONS = {
  bus: {
    label: "버스",
    tint: "bg-blue-100 text-blue-600",
    d: [
      "M8 6v6",
      "M15 6v6",
      "M2 12h19.6",
      "M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3",
      "M5 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
      "M9 18h5",
      "M14 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
    ],
  },
  truck: {
    label: "트럭",
    tint: "bg-amber-100 text-amber-600",
    d: [
      "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2",
      "M15 18H9",
      "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14",
      "M15 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
      "M5 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
    ],
  },
  monitor: {
    label: "단말기",
    tint: "bg-cyan-100 text-cyan-600",
    d: [
      "M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
      "M8 21h8",
      "M12 17v4",
    ],
  },
  camera: {
    label: "사진",
    tint: "bg-violet-100 text-violet-600",
    d: [
      "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z",
      "M9 13a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
    ],
  },
  wrench: {
    label: "설치",
    tint: "bg-orange-100 text-orange-600",
    d: [
      "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
    ],
  },
  chart: {
    label: "현황",
    tint: "bg-emerald-100 text-emerald-600",
    d: ["M3 3v18h18", "M18 17V9", "M13 17V5", "M8 17v-3"],
  },
  clipboard: {
    label: "점검",
    tint: "bg-sky-100 text-sky-600",
    d: [
      "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z",
      "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
      "M12 11h4",
      "M12 16h4",
      "M8 11h.01",
      "M8 16h.01",
    ],
  },
  building: {
    label: "건물",
    tint: "bg-indigo-100 text-indigo-600",
    d: [
      "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z",
      "M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2",
      "M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2",
      "M10 6h4",
      "M10 10h4",
      "M10 14h4",
      "M10 18h4",
    ],
  },
  pin: {
    label: "현장",
    tint: "bg-rose-100 text-rose-600",
    d: ["M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z", "M9 10a3 3 0 1 0 6 0a3 3 0 1 0-6 0"],
  },
  folder: {
    label: "폴더",
    tint: "bg-slate-200 text-slate-600",
    d: [
      "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
    ],
  },
} as const;

export type IconKey = keyof typeof PROJECT_ICONS;
export const ICON_KEYS = Object.keys(PROJECT_ICONS) as IconKey[];

/** 저장값 → 아이콘 키. 모르는 값(옛 이모지 등)은 folder. */
export function iconKey(v: unknown): IconKey {
  return typeof v === "string" && v in PROJECT_ICONS ? (v as IconKey) : "folder";
}

// 카드 배경색 — card: 카드 전체(흰 글씨·아이콘), dot: 선택판의 색 점
export const CARD_COLORS = {
  blue: { label: "파랑", card: "from-blue-600 to-blue-700 shadow-blue-200", dot: "bg-blue-600" },
  teal: { label: "청록", card: "from-teal-500 to-teal-700 shadow-teal-200", dot: "bg-teal-600" },
  emerald: { label: "초록", card: "from-emerald-500 to-emerald-700 shadow-emerald-200", dot: "bg-emerald-600" },
  amber: { label: "주황", card: "from-amber-500 to-orange-600 shadow-amber-200", dot: "bg-amber-500" },
  rose: { label: "분홍", card: "from-rose-500 to-rose-700 shadow-rose-200", dot: "bg-rose-500" },
  violet: { label: "보라", card: "from-violet-500 to-violet-700 shadow-violet-200", dot: "bg-violet-600" },
  indigo: { label: "남색", card: "from-indigo-500 to-indigo-700 shadow-indigo-200", dot: "bg-indigo-600" },
  slate: { label: "회색", card: "from-slate-600 to-slate-800 shadow-slate-300", dot: "bg-slate-700" },
} as const;

export type ColorKey = keyof typeof CARD_COLORS;
export const COLOR_KEYS = Object.keys(CARD_COLORS) as ColorKey[];

/** 저장값 → 색 키. 없거나 모르는 값은 blue. */
export function colorKey(v: unknown): ColorKey {
  return typeof v === "string" && v in CARD_COLORS ? (v as ColorKey) : "blue";
}

// 화면 요소용 아이콘
export const UI = {
  grid: [
    "M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z",
    "M15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z",
    "M15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z",
    "M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z",
  ],
  plus: ["M5 12h14", "M12 5v14"],
  gear: [
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
    "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
  ],
  pencil: [
    "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
    "m15 5 4 4",
  ],
  x: ["M18 6 6 18", "m6 6 12 12"],
  trash: [
    "M3 6h18",
    "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",
    "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",
    "M10 11v6",
    "M14 11v6",
  ],
} as const;

export function Svg({ d, className = "h-6 w-6" }: { d: readonly string[]; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}
