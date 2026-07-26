import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getInstallTeams } from "@/lib/settings";
import { workDateString } from "@/lib/work-day";
import type { RecordBundle } from "@/lib/types";
import RecordEditor from "@/components/RecordEditor";
import PlanDateGuard from "@/components/PlanDateGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RecordPage({
  params,
}: {
  params: { plate: string };
}) {
  const plate = decodeURIComponent(params.plate).trim();
  const supabase = createServiceClient();

  // planned_date·is_added는 오입력 경고용 — 컬럼 없는 옛 DB면 빼고 재시도(경고만 생략)
  const fetchVehicle = async () => {
    const res = await supabase
      .from("vehicles")
      .select("plate, operator, route, year, model, planned_date, is_added")
      .eq("plate", plate)
      .maybeSingle();
    if (res.error && /planned_date|is_added/i.test(res.error.message)) {
      return supabase
        .from("vehicles")
        .select("plate, operator, route, year, model")
        .eq("plate", plate)
        .maybeSingle();
    }
    return res;
  };

  const [vehicleRes, recordRes, photosRes, checkRes, teamOptions] = await Promise.all([
    fetchVehicle(),
    supabase.from("records").select("*").eq("plate", plate).maybeSingle(),
    supabase.from("photos").select("*").eq("plate", plate).order("sort_order"),
    // 차량 이상유무 확인 사진 — 테이블 없는 DB(마이그레이션 전)면 error → 빈 배열
    supabase.from("check_photos").select("*").eq("plate", plate).order("sort_order"),
    // 설치팀 목록 (관리자 페이지에서 관리) — 비어 있으면 팀명 직접 입력으로 폴백
    getInstallTeams(),
  ]);

  // 조회 실패를 '기록 없음'으로 착각하면 편집기가 새 기록처럼 열리고,
  // 저장 시 기존 없음체크·비고·커스텀 항목이 빈 값으로 덮어써진다(유실).
  // check_photos는 마이그레이션 전 DB 호환을 위해 에러를 계속 허용한다.
  const loadError = vehicleRes.error ?? recordRes.error ?? photosRes.error;
  if (loadError) {
    return (
      <main className="mx-auto max-w-md px-4 pt-16 text-center">
        <p className="text-lg font-medium">기록을 불러오지 못했습니다.</p>
        <p className="mt-2 text-sm text-gray-500">
          네트워크 상태를 확인한 뒤 새로고침 해주세요.
        </p>
        <Link href="/" className="mt-6 inline-block text-blue-600 underline">
          ← 처음으로
        </Link>
      </main>
    );
  }

  if (!vehicleRes.data) {
    return (
      <main className="mx-auto max-w-md px-4 pt-16 text-center">
        <p className="text-lg font-medium">차량을 찾을 수 없습니다.</p>
        <p className="mt-2 text-sm text-gray-500">{plate}</p>
        <Link href="/" className="mt-6 inline-block text-blue-600 underline">
          ← 처음으로
        </Link>
      </main>
    );
  }

  const vehicle = vehicleRes.data as RecordBundle["vehicle"] & {
    planned_date?: string | null;
    is_added?: boolean | null;
  };

  const bundle: RecordBundle = {
    vehicle,
    record: (recordRes.data as RecordBundle["record"]) ?? null,
    photos: (photosRes.data as RecordBundle["photos"]) ?? [],
    checkPhotos: (checkRes.data as RecordBundle["checkPhotos"]) ?? [],
  };

  // 금일(업무일) 설치 대상이 아니면 경고 팝업 — 증차 차량(예정일 없이 현장 추가)은 제외
  const notToday =
    "planned_date" in vehicle &&
    vehicle.planned_date !== workDateString(new Date()) &&
    !vehicle.is_added;

  return (
    <>
      {notToday && (
        <PlanDateGuard plate={plate} plannedDate={vehicle.planned_date ?? null} />
      )}
      <RecordEditor plate={plate} initial={bundle} teamOptions={teamOptions} />
    </>
  );
}
