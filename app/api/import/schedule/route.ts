import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseScheduleBuffer } from "@/lib/import/parse-schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHUNK = 500;

// POST /api/import/schedule  (multipart/form-data: file=수정한 진행현황 xlsx)
//   차량리스트 시트의 설치 예정일(I열)·시범설치를 vehicles에 반영(upsert).
//   plate 기준 upsert로 planned_date/operator/route/is_pilot만 갱신(삭제·is_added 보존).
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }

  let parsed;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = await parseScheduleBuffer(buf);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "엑셀을 읽을 수 없습니다." },
      { status: 400 },
    );
  }

  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { error: "차량리스트에서 차량을 찾지 못했습니다. 양식을 확인해주세요." },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  let done = 0;
  for (let i = 0; i < parsed.rows.length; i += CHUNK) {
    const chunk = parsed.rows.slice(i, i + CHUNK);
    const { error } = await supabase.from("vehicles").upsert(chunk, { onConflict: "plate" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    done += chunk.length;
  }

  const withDate = parsed.rows.filter((r) => r.planned_date).length;
  return NextResponse.json({
    updated: done,
    withDate,
    pilot: parsed.pilotCount,
    skipped: parsed.skipped,
  });
}
