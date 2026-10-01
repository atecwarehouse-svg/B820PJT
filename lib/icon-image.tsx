import { ImageResponse } from "next/og";

// 앱 아이콘을 코드로 생성(별도 이미지 파일 불필요).
// 홈 화면 추가 시 보일 아이콘 — 첫 화면(프로젝트 산출물 관리) 엠블럼과 같은 파란 그라데이션 위 2×2 격자.
// 글자가 없어 폰트 로딩이 필요 없다.
export function renderAppIcon(size: number) {
  const cell = Math.round(size * 0.24);
  const gap = Math.round(size * 0.07);
  const radius = Math.round(size * 0.07);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            width: cell * 2 + gap,
            height: cell * 2 + gap,
            gap,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                width: cell,
                height: cell,
                borderRadius: radius,
                background: "#ffffff",
                opacity: i === 3 ? 0.7 : 1, // 마지막 칸만 살짝 연하게 — 평면적이지 않게
              }}
            />
          ))}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
