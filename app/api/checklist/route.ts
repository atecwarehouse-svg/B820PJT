import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSetting, setSetting, INSPECT_CHECKLIST_KEY } from "@/lib/settings";
import { DEFAULT_CHECKLIST, parseChecklist, type ChecklistItem } from "@/lib/checklist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → 검수항목 (배차표 '검수항목 보기'와 관리자 페이지 공용, 인증 불필요)
export async function GET() {
  const raw = await getSetting(INSPECT_CHECKLIST_KEY);
  const list = (raw && parseChecklist(raw)) || DEFAULT_CHECKLIST;
  return NextResponse.json(list);
}

// PUT { vehicle, device: {t,s}[] } → 검수항목 저장 (전체 교체, 관리자 전용)
export async function PUT(req: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    vehicle?: unknown;
    device?: unknown;
  } | null;
  if (!body || !Array.isArray(body.vehicle) || !Array.isArray(body.device)) {
    return NextResponse.json(
      { error: "vehicle·device(배열)가 필요합니다." },
      { status: 400 },
    );
  }
  const clean = (arr: unknown[]): ChecklistItem[] =>
    arr
      .map((v) => ({
        t: String((v as ChecklistItem)?.t ?? "").trim(),
        s: String((v as ChecklistItem)?.s ?? "").trim(),
      }))
      .filter((v) => v.t)
      .slice(0, 30);
  const vehicle = clean(body.vehicle);
  const device = clean(body.device);
  if (vehicle.length === 0 && device.length === 0) {
    return NextResponse.json({ error: "항목이 비어 있습니다." }, { status: 400 });
  }
  const tooLong = [...vehicle, ...device].filter((v) => v.t.length > 60 || v.s.length > 80);
  if (tooLong.length > 0) {
    return NextResponse.json(
      { error: `항목이 너무 깁니다(항목 60자·설명 80자 이하): ${tooLong[0].t}` },
      { status: 400 },
    );
  }
  try {
    await setSetting(INSPECT_CHECKLIST_KEY, JSON.stringify({ vehicle, device }));
  } catch (e) {
    return NextResponse.json(
      { error: "저장 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }
  return NextResponse.json({ vehicle, device });
}
