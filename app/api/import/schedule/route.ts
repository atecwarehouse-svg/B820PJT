import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseScheduleBuffer } from "@/lib/import/parse-schedule";
import { adminPassword, isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHUNK = 500;
const PAGE = 1000;

interface ChangeGroup {
  operator: string;
  from: string | null; // 기존 예정일 (YYYY-MM-DD) | null=미정
  to: string | null; // 변경 예정일
  count: number;
}

// POST /api/import/schedule  (multipart/form-data: file=수정한 진행현황 xlsx, apply=true|false, pw=관리자 비밀번호)
//   관리자 비밀번호(pw) 또는 관리자 페이지 로그인 쿠키가 있어야 한다.
//   apply!=="true" → 미리보기: 파싱+변경내역만 계산(DB 미변경).
//   apply==="true" → 차량리스트 설치 예정일(I열)·시범설치를 vehicles에 반영(upsert).
//   plate 기준 upsert로 planned_date/operator/route/is_pilot만 갱신(삭제·is_added 보존).
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
  try {
    const buf = Buffer.from(await file.arrayBuffer());
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

  // 1) 변경 비교용으로 반영 전 현재 예정일을 먼저 읽어둔다 (plate→예정일).
  const before = new Map<string, string | null>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("plate, planned_date")
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    for (const v of data) {
      before.set(v.plate, v.planned_date ? String(v.planned_date).slice(0, 10) : null);
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
    const from = before.get(r.plate) ?? null;
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

  const withDate = parsed.rows.filter((r) => r.planned_date).length;
  const summary = {
    total: parsed.rows.length, // 양식의 차량 수(반영 대상)
    withDate,
    pilot: parsed.pilotCount,
    skipped: parsed.skipped,
    added,
    changedCount,
    changes,
  };

  // 미리보기(apply=false): DB 변경 없이 변경내역만 반환.
  if (!apply) {
    return NextResponse.json({ applied: false, ...summary });
  }

  // 적용(apply=true): 실제 반영(upsert).
  // list_no 컬럼이 아직 없는 DB(migration_list_no.sql 미실행)면 빼고 재시도(폴백).
  let done = 0;
  let includeListNo = true;
  const stripListNo = (rows: typeof parsed.rows) =>
    rows.map(({ list_no: _list_no, ...rest }) => rest);
  for (let i = 0; i < parsed.rows.length; i += CHUNK) {
    const chunk = parsed.rows.slice(i, i + CHUNK);
    let { error } = await supabase
      .from("vehicles")
      .upsert(includeListNo ? chunk : stripListNo(chunk), { onConflict: "plate" });
    if (error && includeListNo && /list_no/i.test(error.message)) {
      includeListNo = false;
      ({ error } = await supabase
        .from("vehicles")
        .upsert(stripListNo(chunk), { onConflict: "plate" }));
    }
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    done += chunk.length;
  }

  return NextResponse.json({ applied: true, updated: done, ...summary });
}
