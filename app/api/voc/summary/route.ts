import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { summarizeVocs, type VocRow } from "@/lib/voc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/voc/summary?date=YYYY-MM-DD → 그 업무일 운수사별 VOC 요약.
// 금일완료 리포트 2차 탭의 미리보기용. 발송 시에는 서버가 다시 조회하므로
// 여기서 실패해도 미리보기만 비어 보인다.
export async function GET(req: NextRequest) {
  const date = (req.nextUrl.searchParams.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "날짜를 확인하세요." }, { status: 400 });
  }
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("vocs")
      .select("operator, date, items, notes")
      .eq("date", date);
    if (error) throw error;
    return NextResponse.json({ list: summarizeVocs((data ?? []) as VocRow[]) });
  } catch {
    return NextResponse.json({ list: [] });
  }
}
