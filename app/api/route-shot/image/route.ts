import { NextRequest, NextResponse } from "next/server";
import { captureRouteShot } from "@/lib/route-shot";
import { findRoute, routeNoOf } from "@/lib/bis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/route-shot/image?route=93&operator=신흥교통[&routeId=365000004]
// 인천버스정보 + 카카오맵 두 화면을 한 장으로 붙인 PNG를 내려준다(분할화면 캡처 대체).
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const route = (p.get("route") ?? "").trim();
  const operator = (p.get("operator") ?? "").trim();
  let routeId = (p.get("routeId") ?? "").trim();
  if (!route) {
    return NextResponse.json({ error: "노선을 지정하세요." }, { status: 400 });
  }
  const routeNo = routeNoOf(route);

  try {
    // 기점·종점은 카카오맵에서 같은 번호의 다른 지역 노선을 걸러내는 데 쓰므로 항상 조회한다
    // (예: '인천 20번버스' 검색에 경기 부천 20번이 잡힘)
    const bis = await findRoute(routeNo, operator);
    if (!bis && !routeId) {
      return NextResponse.json(
        { error: `버스정보시스템에서 ${routeNo}번 노선을 찾지 못했습니다.` },
        { status: 404 },
      );
    }
    if (!routeId && bis) routeId = bis.routeId;
    const stamp = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
    const { png, bisFailed, kakaoFailed } = await captureRouteShot({
      routeNo,
      routeId,
      title: `${operator ? operator + " · " : ""}${routeNo}번 노선 확인 — ${stamp}`,
      origin: bis?.origin,
      dest: bis?.dest,
    });
    // 두 화면 다 실패했으면 빈 이미지를 내려보내지 말고 사유를 알려준다
    if (bisFailed && kakaoFailed) {
      return NextResponse.json({ error: `${bisFailed} / ${kakaoFailed}` }, { status: 502 });
    }
    const filename = `노선확인_${operator || "노선"}_${routeNo}.png`;
    return new NextResponse(png as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "캡처에 실패했습니다." },
      { status: 500 },
    );
  }
}
