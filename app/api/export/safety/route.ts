import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { renderPdf, renderPdfMany } from "@/lib/export/pdf-render";
import {
  buildPledgeHtml,
  type PledgeSessionData,
  type PledgeSignatureData,
} from "@/lib/export/pledge-html";
import JSZip from "jszip";
import { uploadExport, deletePhoto } from "@/lib/gdrive";
import { isAdmin } from "@/lib/admin-auth";

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
  if (!isAdmin()) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const params = new URL(req.url).searchParams;
  if (params.get("all")) return exportAll();

  const sessionId = params.get("session")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "세션 정보가 없습니다." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: session, error: sErr } = await supabase
    .from("pledge_sessions")
    .select(
      "manager_name, manager_sig, operator, location, install_date, work_content, quantity, start_time, end_time, drive_file_id",
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

// GET /api/export/safety?all=1 — 전체 세션을 세션별 개별 PDF로 만들어 ZIP으로 다운로드.
// 파일명: {운수사}_안전관리서약서_{YYMMDD}.pdf (같은 운수사·같은 날짜는 (2) 접미).
// 드라이브 보관은 세션별 PDF가 담당하므로 여기서는 업로드하지 않는다.
async function exportAll() {
  const supabase = createServiceClient();

  const { data: sessions, error: sErr } = await supabase
    .from("pledge_sessions")
    .select(
      "id, manager_name, manager_sig, operator, location, install_date, work_content, quantity, start_time, end_time",
    )
    .order("install_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  if (!sessions?.length) {
    return NextResponse.json({ error: "생성된 서약서가 없습니다." }, { status: 404 });
  }

  // 서명 이미지 포함 전수 조회 — 1000행 상한 회피를 위해 페이지네이션
  let sigs: (PledgeSignatureData & { session_id: string })[];
  try {
    sigs = await fetchAll<PledgeSignatureData & { session_id: string }>((from, to) =>
      supabase
        .from("pledge_signatures")
        .select("session_id, worker_name, sig_before, sig_after")
        .order("id", { ascending: true })
        .range(from, to),
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "서명 조회 실패" },
      { status: 500 },
    );
  }

  const bySession = new Map<string, PledgeSignatureData[]>();
  for (const r of sigs) {
    const list = bySession.get(r.session_id) ?? [];
    list.push(r);
    bySession.set(r.session_id, list);
  }

  let buffer: Buffer;
  try {
    const pdfs = await renderPdfMany(
      sessions.map((s) =>
        buildPledgeHtml(
          s as unknown as PledgeSessionData,
          bySession.get(s.id as string) ?? [],
        ),
      ),
    );
    const zip = new JSZip();
    const used = new Set<string>();
    sessions.forEach((s, i) => {
      const yymmdd = String(s.install_date ?? "").replace(/-/g, "").slice(2);
      const operator = ((s.operator as string | null) || "미지정").replace(/[\\/]/g, "-");
      let name = `${operator}_안전관리서약서_${yymmdd}.pdf`;
      for (let n = 2; used.has(name); n++) {
        name = `${operator}_안전관리서약서_${yymmdd}(${n}).pdf`;
      }
      used.add(name);
      zip.file(name, pdfs[i]);
    });
    buffer = await zip.generateAsync({ type: "nodebuffer" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PDF 생성 실패" },
      { status: 500 },
    );
  }

  const filename = `안전관리서약서_전체_${sessions.length}건.zip`;
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
