import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/records?q=차량번호  → 업로드된(기록 있는) 차량 목록 + 사진수
export async function GET(req: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const supabase = createServiceClient();

  let query = supabase
    .from("records")
    .select("plate, operator, route, saved_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (q) query = query.ilike("plate", `${q}%`);

  const { data: recs, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const plates = (recs ?? []).map((r) => r.plate);
  // 사진 수·증차 여부 조회 후 plate별 집계
  // (100대 × 14장 ≈ 1,400행이라 1회 요청 상한 1000행에 잘림 → 페이지네이션 필수)
  const [photoRows, vehRes] = await Promise.all([
    plates.length
      ? fetchAll<{ plate: string }>((from, to) =>
          supabase.from("photos").select("plate").in("plate", plates).order("id").range(from, to),
        )
      : Promise.resolve([] as { plate: string }[]),
    plates.length
      ? supabase.from("vehicles").select("plate, is_added").in("plate", plates)
      : Promise.resolve({ data: [] as { plate: string; is_added: boolean }[], error: null }),
  ]);

  const photoCount = new Map<string, number>();
  for (const p of photoRows) {
    photoCount.set(p.plate, (photoCount.get(p.plate) ?? 0) + 1);
  }
  const addedSet = new Set((vehRes.data ?? []).filter((v) => v.is_added).map((v) => v.plate));

  const list = (recs ?? []).map((r) => ({
    plate: r.plate,
    operator: r.operator,
    route: r.route,
    saved_at: r.saved_at,
    photoCount: photoCount.get(r.plate) ?? 0,
    is_added: addedSet.has(r.plate),
  }));

  return NextResponse.json({ list });
}
