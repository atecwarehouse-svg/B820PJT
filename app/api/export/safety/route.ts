import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { renderPdf } from "@/lib/export/pdf-render";
import { buildPledgeHtml } from "@/lib/export/pledge-html";
import { uploadExport, deletePhoto } from "@/lib/gdrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PLEDGE_FOLDER = "인천B820 서약서";
const PDF_MIME = "application/pdf";

// GET /api/export/safety?session=<id>
// 세션의 서명 목록을 워드 양식(2페이지)대로 PDF 1개로 만들어
//  - 구글드라이브 "인천B820 서약서" 폴더에 업로드(보관) 하고
//  - 동시에 attachment 로 스트림(다운로드) 한다. (사진첩 진행현황 다운로드와 동일 방식)
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("session")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "세션 정보가 없습니다." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: session, error: sErr } = await supabase
    .from("pledge_sessions")
    .select(
      "manager_name, operator, location, install_date, work_content, quantity, start_time, end_time, drive_file_id",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  if (!session) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: rows, error: rErr } = await supabase
    .from("pledge_signatures")
    .select("worker_name, sig_before, sig_after")
    .eq("session_id", sessionId)
    .order("id", { ascending: true }); // 입력 순서
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  let buffer: Buffer;
  try {
    const html = buildPledgeHtml(session, rows ?? []);
    buffer = await renderPdf(html);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PDF 생성 실패" },
      { status: 500 },
    );
  }

  const yymmdd = String(session.install_date ?? "").replace(/-/g, "").slice(2); // YYYY-MM-DD → YYMMDD
  const operator = (session.operator || "미지정").replace(/[\\/]/g, "-");
  const filename = `안전관리서약서_${operator}_${yymmdd}.pdf`;

  // 구글드라이브 보관 (best-effort — 실패해도 다운로드는 진행)
  // 세션당 PDF 1개만 유지: 새로 올린 뒤 이전 파일을 삭제하고 파일 ID를 세션에 기록.
  try {
    const { id: newFileId } = await uploadExport(PLEDGE_FOLDER, filename, buffer, PDF_MIME);
    const oldFileId = (session.drive_file_id as string | null) ?? null;
    if (oldFileId && oldFileId !== newFileId) {
      await deletePhoto(oldFileId).catch(() => {}); // 이전 PDF 정리
    }
    await supabase
      .from("pledge_sessions")
      .update({ drive_file_id: newFileId })
      .eq("id", sessionId);
  } catch (e) {
    console.error("[export/safety] 드라이브 업로드 실패:", e);
  }

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": PDF_MIME,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
