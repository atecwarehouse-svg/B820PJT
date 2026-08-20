import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  plate: string;
  operator: string | null;
  route: string | null;
  saved_at?: string | null;
  planned_date?: string | null;
};

// GET /api/admin/records?q=차량번호  → 업로드된(기록 있는) 차량 목록 + 사진수
//     &added=1 → 기록 유무와 무관하게 증차(is_added) 차량 목록 (잘못 등록한 증차 삭제용)
export async function GET(req: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const addedOnly = req.nextUrl.searchParams.get("added") === "1";
  const supabase = createServiceClient();

  let query = addedOnly
    ? supabase
        .from("vehicles")
        .select("plate, operator, route, planned_date")
        .eq("is_added", true)
        .order("plate")
        .limit(100)
    : supabase
        .from("records")
        .select("plate, operator, route, saved_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(100);
  if (q) query = query.ilike("plate", `${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const recs = (data ?? []) as unknown as Row[];

  const plates = recs.map((r) => r.plate);
  // 사진 수·증차 여부 조회 후 plate별 집계
  // (100대 × 14장 ≈ 1,400행이라 1회 요청 상한 1000행에 잘림 → 페이지네이션 필수)
  //   증차 목록(addedOnly)은 vehicles에서 뽑았으니 is_added 재조회 대신 records의 저장 여부를 본다.
  const [photoRows, sideRes] = await Promise.all([
    plates.length
      ? fetchAll<{ plate: string }>((from, to) =>
          supabase.from("photos").select("plate").in("plate", plates).order("id").range(from, to),
        )
      : Promise.resolve([] as { plate: string }[]),
    plates.length
      ? addedOnly
        ? supabase.from("records").select("plate, saved_at").in("plate", plates)
        : supabase.from("vehicles").select("plate, is_added").in("plate", plates)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const photoCount = new Map<string, number>();
  for (const p of photoRows) {
    photoCount.set(p.plate, (photoCount.get(p.plate) ?? 0) + 1);
  }
  const side = (sideRes.data ?? []) as unknown as {
    plate: string;
    is_added?: boolean;
    saved_at?: string | null;
  }[];
  const addedSet = new Set(side.filter((v) => v.is_added).map((v) => v.plate));
  const savedAt = new Map(side.map((v) => [v.plate, v.saved_at ?? null]));

  const list = recs.map((r) => ({
    plate: r.plate,
    operator: r.operator,
    route: r.route,
    saved_at: addedOnly ? (savedAt.get(r.plate) ?? null) : (r.saved_at ?? null),
    planned_date: r.planned_date ?? null,
    photoCount: photoCount.get(r.plate) ?? 0,
    is_added: addedOnly || addedSet.has(r.plate),
  }));

  return NextResponse.json({ list });
}
