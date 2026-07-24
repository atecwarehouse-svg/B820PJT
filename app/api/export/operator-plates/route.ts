import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/export/operator-plates?operator=...
// 해당 운수사 차량 중 '사진이 1장이라도 있는' 차량번호 목록을 반환 (운수사별 내보내기용).
export async function GET(req: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const operator = req.nextUrl.searchParams.get("operator")?.trim();
  if (!operator) {
    return NextResponse.json({ error: "운수사명이 필요합니다." }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 1) 운수사의 차량 plate들
  const vehicles = await fetchAll<{ plate: string }>((from, to) =>
    supabase.from("vehicles").select("plate").eq("operator", operator).order("plate").range(from, to),
  );
  const opPlates = vehicles.map((v) => v.plate);
  if (opPlates.length === 0) {
    return NextResponse.json({ plates: [] });
  }

  // 2) 그 중 사진이 있는 plate (중복 제거)
  // 한글 plate 수백 개를 in()에 한 번에 넣으면 URL 길이 초과로 실패 — 100개씩 분할
  const withPhoto = new Set<string>();
  const CH = 100;
  for (let i = 0; i < opPlates.length; i += CH) {
    const chunk = opPlates.slice(i, i + CH);
    const photoRows = await fetchAll<{ plate: string }>((from, to) =>
      supabase.from("photos").select("plate").in("plate", chunk).order("id").range(from, to),
    );
    for (const p of photoRows) withPhoto.add(p.plate);
  }
  const plates = [...withPhoto].sort();

  return NextResponse.json({ plates });
}
