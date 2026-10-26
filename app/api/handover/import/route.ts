import { NextRequest, NextResponse } from "next/server";
import { checkAdminPassword, isAdmin } from "@/lib/admin-auth";
import { currentProject, currentSlug } from "@/lib/project";
import { createServiceClient } from "@/lib/supabase/server";
import { chunk, fetchAll } from "@/lib/supabase/paginate";
import { setSetting } from "@/lib/settings";
import { HANDOVER_CENTERS_KEY, getCenters } from "@/lib/handover";
import { busType, isExcludedModel, parseHandoverBuffer, type HandoverRow } from "@/lib/import/parse-handover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 양도양수 로우데이터(노선별 차량현황 xlsx) / OS업데이트 적용리스트 업로드 — 관리자(비밀번호 pw 또는 관리자 쿠키).
//   multipart: file, slug(화면 프로젝트 ID — 서버 판별과 다르면 거부), apply("true"면 반영), center(선택)
//   반영 = vehicles upsert(plate·operator·route — 완료 상태 done_at/done_by/note 는 그대로) + 파일에서 빠진 차량 삭제.
//     osupdate: model·bus_type·center 도 저장. 차량 센터 = 파일 '센터' 열 → 없으면 폼 center → 없으면 null(미배정)
//     handover: 폼 center 가 있으면 파일의 미배정 영업소를 그 센터로 배정(영업소→센터 맵)
//   응답 { total, added, removed, offices:[{name,count}], removedPlates, byType?, centers?:{센터:대수}, excluded(공항버스 제외 수), assigned, applied }
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const apply = form.get("apply") === "true";
  const pw = String(form.get("pw") ?? "");
  const claimed = String(form.get("slug") ?? "").trim();
  const center = String(form.get("center") ?? "").trim().slice(0, 30);
  if (claimed && claimed !== currentSlug()) {
    return bad("프로젝트가 일치하지 않습니다(화면 " + claimed + ", 서버 " + currentSlug() + "). 페이지를 새로고침한 뒤 다시 올려주세요.");
  }
  if (!(await checkAdminPassword(pw)) && !(await isAdmin())) return bad("관리자 비밀번호가 올바르지 않습니다.", 401);
  if (!file) return bad("파일이 없습니다.");

  let rows: HandoverRow[];
  try {
    rows = await parseHandoverBuffer(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return bad("엑셀을 읽을 수 없습니다: " + (e instanceof Error ? e.message : String(e)));
  }
  const osupdate = (await currentProject()).kind === "osupdate";
  // OS업데이트: 공항버스(B620) 기종은 대상이 아니라 제외(이미 등록돼 있으면 '빠진 차량'으로 삭제됨)
  let excluded = 0;
  if (osupdate) {
    const kept = rows.filter((r) => !isExcludedModel(r.model));
    excluded = rows.length - kept.length;
    rows = kept;
    if (!rows.length) return bad("공항버스를 제외하면 남는 차량이 없습니다.");
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
  const count = (key: (r: HandoverRow) => string | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = key(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const offices = [...count((r) => r.operator).entries()].map(([name, n]) => ({ name, count: n }));
  const byType = osupdate ? Object.fromEntries(count((r) => busType(r.model, r.route))) : undefined;
  const vehicleCenter = (r: HandoverRow) => r.center ?? (center || undefined);
  const centerCounts = osupdate ? Object.fromEntries(count((r) => vehicleCenter(r) ?? "미배정")) : undefined;

  // 양도양수: 센터 자동 배정 대상 — 아직 센터가 없는 영업소만(기존 배정 유지)
  const centers = await getCenters();
  const unassigned = !osupdate && center ? offices.map((o) => o.name).filter((o) => !centers[o]) : [];

  if (apply) {
    const data = osupdate
      ? rows.map((r) => ({ plate: r.plate, operator: r.operator, route: r.route, model: r.model ?? null, bus_type: busType(r.model, r.route), center: vehicleCenter(r) ?? null }))
      : rows.map((r) => ({ plate: r.plate, operator: r.operator, route: r.route }));
    for (const part of chunk(data, 500)) {
      const { error } = await sb.from("vehicles").upsert(part, { onConflict: "plate" });
      if (error) return bad("차량 저장 실패: " + error.message, 500);
    }
    for (const part of chunk(removedPlates)) {
      const { error } = await sb.from("vehicles").delete().in("plate", part);
      if (error) return bad("빠진 차량 삭제 실패: " + error.message, 500);
    }
    if (unassigned.length) {
      for (const o of unassigned) centers[o] = center;
      try {
        await setSetting(HANDOVER_CENTERS_KEY, JSON.stringify(centers));
      } catch (e) {
        return bad("차량은 저장했지만 센터 배정 저장에 실패했습니다: " + (e instanceof Error ? e.message : String(e)), 500);
      }
    }
  }
  return NextResponse.json({
    total: rows.length,
    added,
    removed: removedPlates.length,
    removedPlates,
    offices,
    byType,
    centers: centerCounts,
    excluded,
    assigned: unassigned.length,
    applied: apply,
  });
}
