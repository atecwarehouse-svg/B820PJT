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

  // records/photos 조회 실패를 '기록 없음'으로 내리면 호출부가 새 기록으로 착각해
  // 저장 시 기존 데이터를 덮어쓸 수 있다. check_photos만 마이그레이션 전 호환으로 허용.
  const loadError = vehicleRes.error ?? recordRes.error ?? photosRes.error;
  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }

  const bundle: RecordBundle = {
    vehicle: vehicleRes.data ?? null,
    record: (recordRes.data as RecordBundle["record"]) ?? null,
    photos: (photosRes.data as RecordBundle["photos"]) ?? [],
    checkPhotos: (checkRes.data as RecordBundle["checkPhotos"]) ?? [],
  };
  return NextResponse.json(bundle);
}
