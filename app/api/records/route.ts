import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { CustomSlot } from "@/lib/slots";
import { sendCompletionCard } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UpsertBody {
  plate: string;
  operator?: string | null; // 운수사 (수정 가능)
  route?: string | null; // 노선 (수정 가능)
  year?: string | null;
  model?: string | null;
  custom_slots?: CustomSlot[];
  saved?: boolean; // true면 '저장'(목록 등록) 처리 → saved_at = now()
}

// POST /api/records  → 레코드 upsert (연식/차종/커스텀 슬롯 저장)
// 차량(vehicles)이 존재해야 하며, 운수사/노선/설치일자는 서버에서 채운다.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as UpsertBody;
  const plate = (body.plate ?? "").trim();
  if (!plate) {
    return NextResponse.json({ error: "차량번호가 필요합니다." }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 차량 마스터 확인 (운수사/노선 스냅샷용)
  const { data: vehicle, error: vErr } = await supabase
    .from("vehicles")
    .select("plate, operator, route")
    .eq("plate", plate)
    .maybeSingle();
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
  if (!vehicle) {
    return NextResponse.json(
      { error: "차량리스트에 없는 차량번호입니다." },
      { status: 404 },
    );
  }

  // 기존 레코드의 install_date 보존 + 이미 완료(saved_at)됐는지 확인(중복 카드 방지)
  const { data: existing } = await supabase
    .from("records")
    .select("install_date, saved_at")
    .eq("plate", plate)
    .maybeSingle();

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
  if (existing?.install_date) {
    payload.install_date = existing.install_date;
  }
  if (body.saved) {
    payload.saved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("records")
    .upsert(payload, { onConflict: "plate" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 처음 완료(저장)되는 순간에만 팀즈 완료 채팅방으로 카드 발송 (재저장 시 중복 발송 안 함).
  // 실패해도 저장 자체는 성공으로 처리(best-effort).
  if (body.saved && !existing?.saved_at) {
    try {
      // 앱 공개 주소(Teams가 사진을 받아갈 절대 URL용) — 요청 헤더에서 추출
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      const origin = host ? `${proto}://${host}` : req.nextUrl.origin;

      // 이 차량 사진을 설치전→설치후, 순서대로 정렬해 절대 URL 구성
      const { data: photoRows } = await supabase
        .from("photos")
        .select("storage_path, label, section, sort_order")
        .eq("plate", plate);
      const photos = (photoRows ?? [])
        .sort((a, b) => {
          if (a.section !== b.section) return a.section === "before" ? -1 : 1;
          return (a.sort_order ?? 0) - (b.sort_order ?? 0);
        })
        .filter((p) => p.storage_path)
        .map((p) => ({
          url: `${origin}/api/photo/${encodeURIComponent(p.storage_path)}`,
          label: (p.label as string) ?? "",
        }));

      await sendCompletionCard({
        operator: (data.operator as string) ?? vehicle.operator ?? "",
        plate,
        route: (data.route as string) ?? vehicle.route ?? "",
        photos,
      });
    } catch {
      // 완료 카드 발송 실패는 무시 (저장은 유지)
    }
  }

  return NextResponse.json({ record: data });
}
