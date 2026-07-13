import { NextResponse } from "next/server";
import { buildProgressXlsx } from "@/lib/export/build-progress-xlsx";
import { progressDownloadPassword } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/export/progress?date=<YYYY-MM-DD>&pw=<다운로드 비밀번호>
// 완료(저장)된 차량을 양식 차량리스트에 채운 xlsx 다운로드.
// date(기준일)를 주면 그 날짜 시점의 스냅샷(누적계획·기준일·완료분)으로 내려준다.
// 없으면 현재 업무일 기준.
// check=1 이면 파일 생성 없이 비밀번호만 확인(클라이언트가 다운로드 전 검증용).
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  if ((params.get("pw") ?? "") !== progressDownloadPassword()) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  if (params.get("check") === "1") {
    return NextResponse.json({ ok: true });
  }

  const dateRaw = params.get("date");
  const asOfDate =
    dateRaw != null && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw.trim())
      ? dateRaw.trim()
      : undefined;

  let buffer: Buffer;
  let filename: string;
  try {
    const r = await buildProgressXlsx({ asOfDate });
    buffer = r.buffer;
    filename = r.filename;
    console.log(
      `[export/progress] 기준일 ${asOfDate ?? "오늘"} · 기존 ${r.filled}대 채움, 신규 ${r.added}대 추가, 제외 ${r.removed}대 제거`,
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "양식 생성 실패" },
      { status: 500 },
    );
  }

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
