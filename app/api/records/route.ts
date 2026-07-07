import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { CustomSlot } from "@/lib/slots";
import { notifyInstallProgress, originFromRequest } from "@/lib/install-status";
import { runAfterResponse } from "@/lib/background";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UpsertBody {
  plate: string;
  operator?: string | null; // 운수사 (수정 가능)
  route?: string | null; // 노선 (수정 가능)
  year?: string | null;
  model?: string | null;
  team?: string | null; // 설치 팀명
  custom_slots?: CustomSlot[];
  na_slots?: string[]; // 단말기 없음 표시 슬롯키
  saved?: boolean; // true면 '저장'(목록 등록) 처리 → 최초 1회만 saved_at = now()
}

// POST /api/records  → 레코드 upsert (연식/차종/커스텀 슬롯 저장)
// 차량(vehicles)이 존재해야 하며, 운수사/노선/설치일자는 서버에서 채운다.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as UpsertBody;
  const plate = (body.plate ?? "").trim();
  if (!plate) {
    return NextResponse.json({ error: "차량번호가 필요합니다." }, { status: 400 });
  }

  // 최종 '저장'(목록 등록) 시 팀명 필수
  const team = (body.team ?? "").trim();
  if (body.saved && !team) {
    return NextResponse.json({ error: "팀명을 입력해야 저장할 수 있습니다." }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 차량 마스터 확인(운수사/노선 스냅샷용)과 기존 레코드 조회를 병렬로
  const [vehicleRes, existingRes] = await Promise.all([
    supabase.from("vehicles").select("plate, operator, route").eq("plate", plate).maybeSingle(),
    supabase.from("records").select("install_date, saved_at").eq("plate", plate).maybeSingle(),
  ]);
  const { data: vehicle, error: vErr } = vehicleRes;
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
  if (!vehicle) {
    return NextResponse.json(
      { error: "차량리스트에 없는 차량번호입니다." },
      { status: 404 },
    );
  }

  // 기존 레코드의 install_date 보존 (없으면 today 기본값)
  const existing = existingRes.data;

  const payload: Record<string, unknown> = {
    plate,
    // 수정값이 오면 그대로, 없으면 차량 마스터값으로
    operator: body.operator ?? vehicle.operator,
    route: body.route ?? vehicle.route,
    year: body.year ?? null,
    model: body.model ?? null,
    custom_slots: body.custom_slots ?? [],
    updated_at: new Date().toISOString(),
  };
  if (body.team !== undefined) {
    payload.team = team || null;
  }
  if (body.na_slots !== undefined) {
    payload.na_slots = body.na_slots;
  }
  if (existing?.install_date) {
    payload.install_date = existing.install_date;
  }
  // 최초 저장 시각만 기록 — 이후 수정 저장해도 완료일(saved_at)은 바뀌지 않는다.
  if (body.saved && !existing?.saved_at) {
    payload.saved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("records")
    .upsert(payload, { onConflict: "plate" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 단말기 없음 체크 등으로 칸이 모두 충족되면 팀즈 시작/완료 알림 (중복방지 내장, best-effort)
  // — 응답을 먼저 돌려보내고 백그라운드로 처리해 저장 버튼 반응을 빠르게 한다.
  const origin = originFromRequest(req) || req.nextUrl.origin;
  runAfterResponse(() => notifyInstallProgress({ supabase, plate, origin }));

  return NextResponse.json({ record: data });
}
