import { ImageResponse } from "next/og";

// 앱 아이콘을 코드로 생성(별도 이미지 파일 불필요).
// 홈 화면 추가 시 보일 아이콘 — 브랜드 파랑 배경에 "B820" 텍스트.
// (텍스트가 모두 영문/숫자라 기본 폰트로 렌더링되어 별도 폰트가 필요 없다.)
export function renderAppIcon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#1d4ed8",
          color: "#ffffff",
        }}
      >
        <div
          style={{
            fontSize: Math.round(size * 0.34),
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1,
          }}
        >
          B820
        </div>
        <div
          style={{
            fontSize: Math.round(size * 0.13),
            fontWeight: 700,
            letterSpacing: size * 0.02,
            marginTop: Math.round(size * 0.05),
            opacity: 0.85,
          }}
        >
          PHOTO
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
