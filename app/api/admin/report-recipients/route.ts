import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSetting, setSetting, REPORT_MAIL_KEY } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseList(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

// GET → 저장된 완료리포트 수신자 목록. DB에 저장된 적 없으면 env(REPORT_MAIL_TO)를 보여줌.
export async function GET() {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const saved = await getSetting(REPORT_MAIL_KEY);
  const list = saved !== null ? parseList(saved) : parseList(process.env.REPORT_MAIL_TO);
  return NextResponse.json({ list, source: saved !== null ? "db" : "env" });
}

// PUT { list: string[] } → 수신자 목록 저장 (전체 교체)
export async function PUT(req: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { list?: unknown } | null;
  if (!body || !Array.isArray(body.list)) {
    return NextResponse.json({ error: "list(배열)가 필요합니다." }, { status: 400 });
  }
  // 정리: 공백 제거·중복 제거·최대 50명
  const list = [...new Set(body.list.map((v) => String(v).trim()).filter(Boolean))].slice(0, 50);
  const bad = list.filter((s) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  if (bad.length > 0) {
    return NextResponse.json(
      { error: `메일 주소 형식이 올바르지 않습니다: ${bad.join(", ")}` },
      { status: 400 },
    );
  }
  try {
    await setSetting(REPORT_MAIL_KEY, list.join(", "));
  } catch (e) {
    return NextResponse.json(
      { error: "저장 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, list });
}
