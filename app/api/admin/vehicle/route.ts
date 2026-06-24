import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { deletePhoto } from "@/lib/gdrive";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/admin/vehicle?plate=...
//   업로드 사진(Drive 파일 + DB) + 레코드 삭제. 증차(is_added) 차량은 차량리스트에서도 제거.
export async function DELETE(req: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const plate = req.nextUrl.searchParams.get("plate")?.trim();
  if (!plate) {
    return NextResponse.json({ error: "차량번호가 없습니다." }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 1) Drive 파일 삭제 (사진별 storage_path)
  const { data: photos } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("plate", plate);
  let deletedPhotos = 0;
  for (const p of photos ?? []) {
    if (p.storage_path) {
      await deletePhoto(p.storage_path).catch(() => {});
      deletedPhotos++;
    }
  }

  // 2) DB: 사진 행 삭제 후 레코드 삭제 (FK cascade 있어도 명시적으로)
  await supabase.from("photos").delete().eq("plate", plate);
  await supabase.from("records").delete().eq("plate", plate);

  // 3) 증차(앱에서 추가한) 차량이면 차량리스트에서도 완전 삭제
  const { data: veh } = await supabase
    .from("vehicles")
    .select("is_added")
    .eq("plate", plate)
    .maybeSingle();
  let removedVehicle = false;
  if (veh?.is_added) {
    await supabase.from("vehicles").delete().eq("plate", plate);
    removedVehicle = true;
  }

  return NextResponse.json({ ok: true, deletedPhotos, removedVehicle });
}
