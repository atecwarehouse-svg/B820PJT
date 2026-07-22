import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseScheduleBuffer } from "@/lib/import/parse-schedule";
import { prepareTemplateBuffer } from "@/lib/import/prepare-template";
import { adminPassword, isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHUNK = 500;
const PAGE = 1000;

// 다운로드 템플릿 위치 (build-progress-xlsx.ts와 동일 규칙)
const TEMPLATE_BUCKET = process.env.TEMPLATE_BUCKET ?? "templates";
const TEMPLATE_OBJECT = process.env.TEMPLATE_OBJECT ?? "progress-template.xlsx";
const TEMPLATE_BACKUP = TEMPLATE_OBJECT.replace(/\.xlsx$/, "") + ".backup.xlsx";

interface ChangeGroup {
  operator: string;
  from: string | null; // 기존 예정일 (YYYY-MM-DD) | null=미정
  to: string | null; // 변경 예정일
  count: number;
}

// POST /api/import/schedule  (multipart/form-data: file=수정한 진행현황 xlsx, apply=true|false, pw=관리자 비밀번호)
//   관리자 비밀번호(pw) 또는 관리자 페이지 로그인 쿠키가 있어야 한다.
//   apply!=="true" → 미리보기: 파싱+변경내역만 계산(DB 미변경).
//   apply==="true" → 차량리스트 설치 예정일(I열)·시범설치를 vehicles에 반영(upsert)
//   + 차량리스트에서 빠진 차량은 삭제(수량 교정). 단 증차(is_added)와
//   설치기록·사진이 있는 차량은 보호(삭제하지 않고 미리보기에 알림만).
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const apply = form.get("apply") === "true";
  const pw = String(form.get("pw") ?? "");
  if (pw !== adminPassword() && !isAdmin()) {
    return NextResponse.json({ error: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  if (!file) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }

  let parsed;
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    parsed = await parseScheduleBuffer(buf);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "엑셀을 읽을 수 없습니다." },
      { status: 400 },
    );
  }

  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { error: "차량리스트에서 차량을 찾지 못했습니다. 양식을 확인해주세요." },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // 1) 변경 비교·제외 판정용으로 반영 전 차량 전체를 읽어둔다 (plate→예정일·운수사·증차여부).
  //    is_added 컬럼이 없는 DB(migration_added.sql 미실행)면 빼고 재시도(폴백).
  const before = new Map<
    string,
    { plate: string; planned: string | null; operator: string; isAdded: boolean }
  >();
  let hasIsAdded = true;
  for (let from = 0; ; from += PAGE) {
    const select = () =>
      supabase
        .from("vehicles")
        .select(
          hasIsAdded ? "plate, planned_date, operator, is_added" : "plate, planned_date, operator",
        )
        .range(from, from + PAGE - 1);
    let { data, error } = await select();
    if (error && hasIsAdded && /is_added/i.test(error.message)) {
      hasIsAdded = false;
      ({ data, error } = await select());
    }
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    for (const v of data as unknown as {
      plate: string;
      planned_date: string | null;
      operator: string | null;
      is_added?: boolean | null;
    }[]) {
      before.set(v.plate, {
        plate: v.plate,
        planned: v.planned_date ? String(v.planned_date).slice(0, 10) : null,
        operator: v.operator ?? "",
        isAdded: Boolean(v.is_added),
      });
    }
    if (data.length < PAGE) break;
  }

  // 2) 변경 내역 집계: 예정일이 바뀐 차량을 운수사·(기존→변경) 날짜로 묶는다.
  const groupMap = new Map<string, ChangeGroup>();
  let added = 0; // 기존에 없던 신규 차량
  let changedCount = 0;
  for (const r of parsed.rows) {
    if (!before.has(r.plate)) {
      added++;
      continue;
    }
    const from = before.get(r.plate)?.planned ?? null;
    const to = r.planned_date;
    if (from === to) continue; // 변경 없음
    changedCount++;
    const key = `${r.operator}|${from}|${to}`;
    const g = groupMap.get(key) ?? { operator: r.operator, from, to, count: 0 };
    g.count++;
    groupMap.set(key, g);
  }
  const changes = [...groupMap.values()].sort(
    (a, b) => b.count - a.count || a.operator.localeCompare(b.operator),
  );

  // 3) 차량리스트에서 빠진 차량 = 제외(삭제) 대상. 증차(is_added)는 엑셀에 없어도 보호,
  //    설치기록·사진이 있는 차량도 보호(작업 데이터 유실 방지 — 알림만).
  const filePlates = new Set(parsed.rows.map((r) => r.plate));
  const candidates = [...before.values()].filter((v) => !filePlates.has(v.plate) && !v.isAdded);
  const toRemove: typeof candidates = [];
  const protectedPlates: string[] = [];
  if (candidates.length > 0) {
    const started = new Set<string>();
    const candPlates = candidates.map((v) => v.plate);
    // in() 필터는 GET 쿼리스트링이라 한글 차량번호를 많이 담으면 URL 길이 초과로 실패 → 100대씩.
    const IN_CHUNK = 100;
    for (let i = 0; i < candPlates.length; i += IN_CHUNK) {
      const slice = candPlates.slice(i, i + IN_CHUNK);
      for (const table of ["records", "photos"] as const) {
        const { data, error } = await supabase.from(table).select("plate").in("plate", slice);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        for (const r of data ?? []) started.add(r.plate);
      }
    }
    for (const v of candidates) {
      if (started.has(v.plate)) protectedPlates.push(v.plate);
      else toRemove.push(v);
    }
  }
  const removedMap = new Map<string, { operator: string; count: number; plates: string[] }>();
  for (const v of toRemove) {
    const g = removedMap.get(v.operator) ?? { operator: v.operator, count: 0, plates: [] };
    g.count++;
    g.plates.push(v.plate);
    removedMap.set(v.operator, g);
  }
  const removed = [...removedMap.values()].sort(
    (a, b) => b.count - a.count || a.operator.localeCompare(b.operator),
  );

  const withDate = parsed.rows.filter((r) => r.planned_date).length;
  const summary = {
    total: parsed.rows.length, // 양식의 차량 수(반영 대상)
    withDate,
    pilot: parsed.pilotCount,
    skipped: parsed.skipped,
    added,
    changedCount,
    changes,
    removedCount: toRemove.length,
    removed,
    protectedPlates,
  };

  // 미리보기(apply=false): DB 변경 없이 변경내역만 반환.
  // + 이 파일이 다운로드 양식(템플릿)으로 교체 가능한지 미리 알려준다.
  if (!apply) {
    const t = await prepareTemplateBuffer(buf, { checkOnly: true });
    return NextResponse.json({
      applied: false,
      ...summary,
      template: { ok: t.ok, reason: t.reason, warn: t.warn },
    });
  }

  // 적용(apply=true): 실제 반영(upsert).
  // 마이그레이션 전 DB에 아직 없을 수 있는 컬럼(list_no·tacho)은 에러 시 빼고 재시도(폴백).
  let done = 0;
  const optional = { list_no: true, tacho: true };
  const shape = (rows: typeof parsed.rows) =>
    rows.map(({ list_no, tacho, ...rest }) => ({
      ...rest,
      ...(optional.list_no ? { list_no } : {}),
      ...(optional.tacho ? { tacho } : {}),
    }));
  for (let i = 0; i < parsed.rows.length; i += CHUNK) {
    const chunk = parsed.rows.slice(i, i + CHUNK);
    let { error } = await supabase.from("vehicles").upsert(shape(chunk), { onConflict: "plate" });
    // 없는 컬럼이 여러 개일 수 있어 컬럼당 1회씩 재시도
    for (const key of ["list_no", "tacho"] as const) {
      if (error && optional[key] && new RegExp(key, "i").test(error.message)) {
        optional[key] = false;
        ({ error } = await supabase
          .from("vehicles")
          .upsert(shape(chunk), { onConflict: "plate" }));
      }
    }
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    done += chunk.length;
  }

  // 제외 차량 삭제 — 미리보기에서 보여준 목록 그대로 (records/photos 있는 차량은 위에서 제외됨).
  // in() 필터 URL 길이 제한 때문에 100대씩 나눠 삭제.
  for (let i = 0; i < toRemove.length; i += 100) {
    const plates = toRemove.slice(i, i + 100).map((v) => v.plate);
    const { error } = await supabase.from("vehicles").delete().in("plate", plates);
    if (error) {
      return NextResponse.json({ error: `제외 차량 삭제 실패: ${error.message}` }, { status: 500 });
    }
  }

  // 다운로드 양식(템플릿) 자동 교체 — 업로드 파일이 완전한 양식이면 그 파일이 곧 최신 양식이다.
  // (노선명 변경·일정 재편성을 DB에만 반영하고 템플릿이 옛 버전으로 남으면
  //  전개일정 대상수량 보정이 어긋나 총대수가 틀어지는 문제 방지 — 2026-07-13 실사례)
  // 교체 실패는 일정 반영을 되돌리지 않고 안내만 한다.
  let templateReplaced = false;
  let templateNote: string | undefined;
  try {
    const prep = await prepareTemplateBuffer(buf);
    if (!prep.ok || !prep.buffer) {
      templateNote = prep.reason;
    } else {
      const storage = supabase.storage.from(TEMPLATE_BUCKET);
      // 직전 템플릿 백업(실패해도 교체는 진행)
      await storage.remove([TEMPLATE_BACKUP]);
      await storage.copy(TEMPLATE_OBJECT, TEMPLATE_BACKUP);
      const { error: upError } = await storage.upload(TEMPLATE_OBJECT, prep.buffer, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
      if (upError) {
        templateNote = `다운로드 양식 교체 실패(${upError.message}) — 일정만 반영되었습니다.`;
      } else {
        templateReplaced = true;
        templateNote = prep.warn;
      }
    }
  } catch (e) {
    templateNote = `다운로드 양식 교체 실패(${e instanceof Error ? e.message : "알 수 없는 오류"}) — 일정만 반영되었습니다.`;
  }

  return NextResponse.json({ applied: true, updated: done, templateReplaced, templateNote, ...summary });
}
