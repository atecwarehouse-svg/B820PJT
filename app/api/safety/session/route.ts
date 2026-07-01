import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateBody {
  manager_name?: string;
  operator?: string;
  location?: string;
  install_date?: string; // YYYY-MM-DD
  quantity?: string;
  start_time?: string;
  end_time?: string;
}

// POST /api/safety/session  → 안전관리 서약서 세션 생성 (공유 링크용)
// 안전관리자가 이름·운수사·장소·설치일자를 입력하면 세션 1개를 만들고 id를 반환한다.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as CreateBody;
  const manager = (body.manager_name ?? "").trim();
  if (!manager) {
    return NextResponse.json(
      { error: "안전관리자 이름을 입력하세요." },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  const payload: Record<string, unknown> = {
    manager_name: manager,
    operator: body.operator?.trim() || null,
    location: body.location?.trim() || null,
    quantity: body.quantity?.trim() || null,
    start_time: body.start_time?.trim() || null,
    end_time: body.end_time?.trim() || null,
  };
  const installDate = (body.install_date ?? "").trim();
  if (installDate) payload.install_date = installDate;

  const { data, error } = await supabase
    .from("pledge_sessions")
    .insert(payload)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
