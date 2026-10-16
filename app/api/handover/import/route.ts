import { NextRequest, NextResponse } from "next/server";
import { checkAdminPassword, isAdmin } from "@/lib/admin-auth";
import { currentSlug } from "@/lib/project";
import { createServiceClient } from "@/lib/supabase/server";
import { chunk, fetchAll } from "@/lib/supabase/paginate";
import { parseHandoverBuffer } from "@/lib/import/parse-handover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 양도양수 로우데이터(노선별 차량현황 xlsx) 업로드 — 관리자(비밀번호 pw 또는 관리자 쿠키).
//   multipart: file, slug(화면 프로젝트 ID — 서버 판별과 다르면 거부), apply("true"면 반영)
//   반영 = vehicles upsert(plate·operator·route만 — 완료 상태 done_at/done_by/note 는 그대로) + 파일에서 빠진 차량 삭제.
//   응답 { total, added, removed, offices:[{name,count}], removedPlates }
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const apply = form.get("apply") === "true";
  const pw = String(form.get("pw") ?? "");
  const claimed = String(form.get("slug") ?? "").trim();
  if (claimed && claimed !== currentSlug()) {
    return bad("프로젝트가 일치하지 않습니다(화면 " + claimed + ", 서버 " + currentSlug() + "). 페이지를 새로고침한 뒤 다시 올려주세요.");
  }
  if (!(await checkAdminPassword(pw)) && !(await isAdmin())) return bad("관리자 비밀번호가 올바르지 않습니다.", 401);
  if (!file) return bad("파일이 없습니다.");

  let rows;
  try {
    rows = await parseHandoverBuffer(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return bad("엑셀을 읽을 수 없습니다: " + (e instanceof Error ? e.message : String(e)));
  }

  const sb = createServiceClient();
  let existing: { plate: string }[];
  try {
    existing = await fetchAll<{ plate: string }>((from, to) => sb.from("vehicles").select("plate").order("plate").range(from, to));
  } catch (e) {
    return bad("기존 차량 조회 실패: " + (e instanceof Error ? e.message : String(e)), 500);
  }
  const have = new Set(existing.map((v) => v.plate));
  const incoming = new Set(rows.map((r) => r.plate));
  const added = rows.filter((r) => !have.has(r.plate)).length;
  const removedPlates = [...have].filter((p) => !incoming.has(p));
  const officeCount = new Map<string, number>();
  for (const r of rows) officeCount.set(r.operator, (officeCount.get(r.operator) ?? 0) + 1);
  const offices = [...officeCount.entries()].map(([name, count]) => ({ name, count }));

  if (apply) {
    for (const part of chunk(rows, 500)) {
      const { error } = await sb.from("vehicles").upsert(part, { onConflict: "plate" });
      if (error) return bad("차량 저장 실패: " + error.message, 500);
    }
    for (const part of chunk(removedPlates)) {
      const { error } = await sb.from("vehicles").delete().in("plate", part);
      if (error) return bad("빠진 차량 삭제 실패: " + error.message, 500);
    }
  }
  return NextResponse.json({ total: rows.length, added, removed: removedPlates.length, removedPlates, offices, applied: apply });
}
