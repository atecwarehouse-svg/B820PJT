import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // 프로젝트 선택 화면 애니메이션 — 카드 떠오르기·시트 올라오기·배경 페이드
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(14px) scale(.97)" },
          to: { opacity: "1", transform: "none" },
        },
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "none" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        // 완료 팝업 — 동그라미가 튀어나오고 체크/휴지통 선이 그려진다
        pop: {
          "0%": { opacity: "0", transform: "scale(.4)" },
          "60%": { opacity: "1", transform: "scale(1.12)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        draw: {
          from: { strokeDashoffset: "60" },
          to: { strokeDashoffset: "0" },
        },
      },
      animation: {
        rise: "rise .45s cubic-bezier(.2,.8,.2,1) both",
        "sheet-up": "sheet-up .35s cubic-bezier(.2,.8,.2,1) both",
        "fade-in": "fade-in .25s ease-out both",
        pop: "pop .55s cubic-bezier(.2,.8,.2,1) both",
        draw: "draw .45s .3s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
