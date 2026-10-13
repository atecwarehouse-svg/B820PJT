import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { PROJECT_ICONS, colorKey, iconKey, type ColorKey } from "@/components/ProjectIcon";

// 프로젝트별 앱 아이콘(PNG) — 홈 화면 추가(PWA)·apple-touch-icon용. 런처 카드와 같은 색 그라데이션 + 선 아이콘.
// GET /api/project-icon?size=192&color=rose&icon=bus — 색·아이콘을 쿼리로 받아 DB·프로젝트 판별 없이 그린다(캐시 가능).
// 글자가 없어 폰트가 필요 없고, Node 런타임의 og는 한글 경로에서 기본 폰트 URL이 깨지므로 edge로 돌린다(app/icon.tsx와 동일).
export const runtime = "edge";

const GRADIENT: Record<ColorKey, [string, string]> = {
  blue: ["#2563eb", "#1d4ed8"],
  teal: ["#14b8a6", "#0f766e"],
  emerald: ["#10b981", "#047857"],
  amber: ["#f59e0b", "#ea580c"],
  rose: ["#f43f5e", "#be123c"],
  violet: ["#8b5cf6", "#6d28d9"],
  indigo: ["#6366f1", "#4338ca"],
  slate: ["#475569", "#1e293b"],
};

export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const size = Math.min(1024, Math.max(48, Number(q.get("size")) || 512));
  const [from, to] = GRADIENT[colorKey(q.get("color"))];
  const paths = PROJECT_ICONS[iconKey(q.get("icon"))].d;
  const glyph = Math.round(size * 0.56); // 마스커블 안전 영역 안에 들어가게
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
        }}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          {paths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
