import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { adminPassword } from "@/lib/admin-auth";
import { deletePhoto } from "@/lib/gdrive";

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

// DELETE /api/safety/session  body: { sessionId, password }
// 관리자 비밀번호가 맞아야 세션(및 서명 전체, FK cascade)을 삭제한다.
export async function DELETE(req: NextRequest) {
  const { sessionId, password } = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    password?: string;
  };
  if (!password || password !== adminPassword()) {
    return NextResponse.json(
      { error: "관리자 비밀번호가 올바르지 않습니다." },
      { status: 401 },
    );
  }
  const id = (sessionId ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "세션 정보가 없습니다." }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 구글드라이브에 보관된 서약서 PDF도 함께 삭제 (best-effort)
  const { data: sess } = await supabase
    .from("pledge_sessions")
    .select("drive_file_id")
    .eq("id", id)
    .maybeSingle();
  const driveId = (sess?.drive_file_id as string | null) ?? null;
  if (driveId) {
    await deletePhoto(driveId).catch(() => {});
  }

  // pledge_signatures 는 session_id on delete cascade 라 함께 삭제됨.
  const { error } = await supabase.from("pledge_sessions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
