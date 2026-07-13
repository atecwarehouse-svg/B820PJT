import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { CustomSlot } from "@/lib/slots";
import { notifyInstallProgress, originFromRequest } from "@/lib/install-status";
import { runAfterResponse } from "@/lib/background";
import { adminPassword, isAdmin } from "@/lib/admin-auth";

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
  check_na_slots?: string[]; // 차량 이상유무 '없음' 표시 슬롯키
  check_note?: string | null; // 차량 이상유무 비고
  extra_note?: string | null; // 설치 특이사항
  saved?: boolean; // true면 '저장'(목록 등록) 처리 → 최초 1회만 saved_at = now()
  admin_pw?: string; // 팀명 변경용 관리자 비밀번호 (한번 저장된 팀명은 관리자만 변경)
}

// 마이그레이션(migration_inspection.sql) 전 DB에는 없는 컬럼 — upsert 실패 시 빼고 재시도
const INSPECTION_COLUMNS = ["check_na_slots", "check_note", "extra_note"] as const;

// POST /api/records  → 레코드 upsert (연식/차종/커스텀 슬롯 저장)
// 차량(vehicles)이 존재해야 하며, 운수사/노선/설치일자는 서버에서 채운다.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as UpsertBody;
  const plate = (body.plate ?? "").trim();
  if (!plate) {
    return NextResponse.json({ error: "차량번호가 필요합니다." }, { status: 400 });
  }

  // 최종 '저장'(목록 등록) 시 팀명·비고(차량 이상유무)·특이사항 필수
  const team = (body.team ?? "").trim();
  if (body.saved) {
    if (!team) {
      return NextResponse.json({ error: "팀명을 입력해야 저장할 수 있습니다." }, { status: 400 });
    }
    if (!(body.check_note ?? "").trim()) {
      return NextResponse.json(
        { error: "비고(차량 이상유무)를 입력해야 저장할 수 있습니다. (없으면 '없음')" },
        { status: 400 },
      );
    }
    if (!(body.extra_note ?? "").trim()) {
      return NextResponse.json(
        { error: "특이사항을 입력해야 저장할 수 있습니다. (없으면 '없음')" },
        { status: 400 },
      );
    }
  }

  const supabase = createServiceClient();

  // 차량 마스터 확인(운수사/노선 스냅샷용)과 기존 레코드 조회를 병렬로
  const [vehicleRes, existingRes] = await Promise.all([
    supabase.from("vehicles").select("plate, operator, route").eq("plate", plate).maybeSingle(),
    supabase.from("records").select("install_date, saved_at, team").eq("plate", plate).maybeSingle(),
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

  // 팀명은 한번 저장되면 관리자만 변경 가능 — 기존 값이 있고 다른 값으로 바꾸려면
  // 관리자 비밀번호(admin_pw) 또는 관리자 로그인 쿠키 필요.
  const prevTeam = ((existing?.team as string | null) ?? "").trim();
  if (body.team !== undefined && prevTeam && team !== prevTeam) {
    if ((body.admin_pw ?? "") !== adminPassword() && !isAdmin()) {
      return NextResponse.json(
        { error: "팀명은 저장 후 관리자만 변경할 수 있습니다. 관리자 비밀번호를 확인해주세요." },
        { status: 401 },
      );
    }
  }

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
  if (body.check_na_slots !== undefined) {
    payload.check_na_slots = body.check_na_slots;
  }
  if (body.check_note !== undefined) {
    payload.check_note = (body.check_note ?? "").trim() || null;
  }
  if (body.extra_note !== undefined) {
    payload.extra_note = (body.extra_note ?? "").trim() || null;
  }
  if (existing?.install_date) {
    payload.install_date = existing.install_date;
  }
  // 최초 저장 시각만 기록 — 이후 수정 저장해도 완료일(saved_at)은 바뀌지 않는다.
  if (body.saved && !existing?.saved_at) {
    payload.saved_at = new Date().toISOString();
  }

  const upsert = (p: Record<string, unknown>) =>
    supabase.from("records").upsert(p, { onConflict: "plate" }).select("*").single();

  let { data, error } = await upsert(payload);
  // 이상유무 컬럼이 아직 없는 DB(migration_inspection.sql 미실행)면 그 필드만 빼고 재시도
  if (error && INSPECTION_COLUMNS.some((c) => payload[c] !== undefined && error!.message.includes(c))) {
    const stripped = { ...payload };
    for (const c of INSPECTION_COLUMNS) delete stripped[c];
    ({ data, error } = await upsert(stripped));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 팀즈 시작/완료 알림은 '저장' 버튼(saved=true)에서만 발송 —
  // 칸 충족 + 내용 지문 비교(수정사항 있으면 재발송)는 공용 헬퍼가 판정.
  // 응답을 먼저 돌려보내고 백그라운드로 처리해 저장 버튼 반응을 빠르게 한다.
  if (body.saved) {
    const origin = originFromRequest(req) || req.nextUrl.origin;
    runAfterResponse(() => notifyInstallProgress({ supabase, plate, origin }));
  }

  return NextResponse.json({ record: data });
}
