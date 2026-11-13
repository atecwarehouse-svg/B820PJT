import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

// tokens.css 의 "R G B" 변수 → Tailwind 색 단계(투명도 표기 지원)
const scale = (name: string) =>
  Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => [n, `rgb(var(--${name}-${n}) / <alpha-value>)`]));

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // 에이텍모빌리티 테마 — 값은 app/tokens.css 한 곳에서 정한다.
      //   brand = 에이텍 레드(주요 버튼·선택) / blue = 청록(안내·진행 상태·링크, 기존 blue 클래스가 그대로 이 색이 된다) / gray = 무채색
      colors: {
        brand: scale("brand"),
        blue: scale("info"),
        gray: scale("ink"),
        // 흰 글자를 올리는 버튼 색(600)이 옅어 글자가 안 읽히던 것 — 한 단계 진하게
        green: { ...colors.green, 600: colors.green[700] },
        emerald: { ...colors.emerald, 600: colors.emerald[700] },
        sky: { ...colors.sky, 600: colors.sky[700] },
      },
      fontFamily: { sans: ["var(--font-body)"] },
      // 모서리를 한 단계씩 낮춰 단정하게 — 카드 10px, 큰 시트 14px
      borderRadius: { xl: "8px", "2xl": "10px", "3xl": "14px" },
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
        // 촬영 화면 — 지금 눌러야 할 버튼 테두리에 빨간 고리가 퍼져 나간다
        attn: {
          "0%": { boxShadow: "0 0 0 0 rgba(220,38,38,.75)" },
          "70%, 100%": { boxShadow: "0 0 0 10px rgba(220,38,38,0)" },
        },
      },
      animation: {
        rise: "rise .45s cubic-bezier(.2,.8,.2,1) both",
        "sheet-up": "sheet-up .35s cubic-bezier(.2,.8,.2,1) both",
        "fade-in": "fade-in .25s ease-out both",
        pop: "pop .55s cubic-bezier(.2,.8,.2,1) both",
        draw: "draw .45s .3s ease-out both",
        attn: "attn 1.2s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
