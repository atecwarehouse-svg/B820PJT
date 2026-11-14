import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { chunk } from "@/lib/supabase/paginate";
import { PILOT_CUTOFF } from "@/lib/import/parse-schedule";
import { checkAdminPassword, isAdmin } from "@/lib/admin-auth";
import { currentSlug, isDefault } from "@/lib/project";
import { getPlanDays, savePlanDays, shiftPlan } from "@/lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/schedule/move  { plates: string[], date: "YYYY-MM-DD", pw }
// 선택한 차량의 설치 예정일(vehicles.planned_date)만 바꾼다 — 엑셀 재업로드 없이 일정만 이동.
// 다운로드 양식의 차량리스트 I열은 DB 기준으로 다시 채워지므로(fill-progress-xlsx) 별도 처리 없음.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    plates?: unknown;
    date?: unknown;
    pw?: unknown;
  } | null;
  const pw = String(body?.pw ?? "");
  if (!(await checkAdminPassword(pw)) && !(await isAdmin())) {
    return NextResponse.json({ error: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  const plates = Array.isArray(body?.plates)
    ? [...new Set(body!.plates.map((p) => String(p).trim()).filter(Boolean))]
    : [];
  const date = String(body?.date ?? "").trim();
  if (plates.length === 0) {
    return NextResponse.json({ error: "차량을 선택해주세요." }, { status: 400 });
  }
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "변경할 날짜를 확인해주세요." }, { status: 400 });
  }

  // 시범설치 판정은 업로드 파서와 같은 기준(예정일 < 컷오프)으로 다시 계산해 어긋나지 않게 한다.
  const patch = { planned_date: date, is_pilot: isDefault(currentSlug()) && date < PILOT_CUTOFF }; // 시범설치 컷오프는 B820 전용
  const moved: string[] = [];
  const before = new Map<string, string | null>(); // 옮기기 전 예정일 — 원본 계획 조정용
  for (const part of chunk(plates)) {
    const { data: old } = await createServiceClient().from("vehicles").select("plate, planned_date").in("plate", part);
    for (const v of (old ?? []) as { plate: string; planned_date: string | null }[]) before.set(v.plate, v.planned_date);
    const { data, error } = await supabaseUpdate(part, patch);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    moved.push(...data);
  }

  // 보관된 원본 계획(lib/quota.ts)이 있으면 옮긴 대수만큼 같이 옮긴다 — 합의로 바꾼 일정은 계획 변경이다.
  // 실패해도 일정 이동은 유지.
  try {
    const plan = await getPlanDays();
    const known = moved.filter((p) => before.has(p)); // 이전 예정일을 못 읽은 차량은 빼고(계획만 늘어나지 않게)
    if (plan && known.length) await savePlanDays(shiftPlan(plan, known.map((p) => before.get(p)), date));
  } catch (e) {
    console.error("[schedule/move] 원본 계획 조정 실패", e instanceof Error ? e.message : e);
  }

  revalidateTag("dashboard"); // 대시보드 집계(60초 캐시) 즉시 갱신
  const missing = plates.filter((p) => !moved.includes(p));
  return NextResponse.json({ moved: moved.length, date, missing });
}

async function supabaseUpdate(plates: string[], patch: { planned_date: string; is_pilot: boolean }) {
  const supabase = createServiceClient();
  let { data, error } = await supabase
    .from("vehicles")
    .update(patch)
    .in("plate", plates)
    .select("plate");
  // is_pilot 컬럼이 없는 DB(마이그레이션 전)면 예정일만 반영 (import/schedule 폴백과 같은 방식)
  if (error && /is_pilot/i.test(error.message)) {
    ({ data, error } = await supabase
      .from("vehicles")
      .update({ planned_date: patch.planned_date })
      .in("plate", plates)
      .select("plate"));
  }
  return { data: (data ?? []).map((v: { plate: string }) => v.plate), error };
}
