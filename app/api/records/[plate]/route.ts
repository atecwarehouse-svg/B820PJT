import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { RecordBundle } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/records/[plate]  → 편집/조회용 통합 데이터 (차량 + 레코드 + 사진)
export async function GET(
  _req: NextRequest,
  { params }: { params: { plate: string } },
) {
  const plate = decodeURIComponent(params.plate).trim();
  const supabase = createServiceClient();

  const [vehicleRes, recordRes, photosRes, checkRes] = await Promise.all([
    supabase.from("vehicles").select("plate, operator, route").eq("plate", plate).maybeSingle(),
    supabase.from("records").select("*").eq("plate", plate).maybeSingle(),
    supabase.from("photos").select("*").eq("plate", plate).order("sort_order"),
    // 차량 이상유무 확인 사진 — 테이블 없는 DB(마이그레이션 전)면 error → 빈 배열
    supabase.from("check_photos").select("*").eq("plate", plate).order("sort_order"),
  ]);

  if (vehicleRes.error) {
    return NextResponse.json({ error: vehicleRes.error.message }, { status: 500 });
  }

  const bundle: RecordBundle = {
    vehicle: vehicleRes.data ?? null,
    record: (recordRes.data as RecordBundle["record"]) ?? null,
    photos: (photosRes.data as RecordBundle["photos"]) ?? [],
    checkPhotos: (checkRes.data as RecordBundle["checkPhotos"]) ?? [],
  };
  return NextResponse.json(bundle);
}
