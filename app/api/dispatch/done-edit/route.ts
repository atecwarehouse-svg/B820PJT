import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { setSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 설치완료 차량 리스트(캡쳐용)에서 손으로 고친 시간·출발지 — 운수사 배차표 엑셀 값보다 우선.
// POST { date, plate, time, from } → app_settings `done_edit:<date>` = { [plate]: { time, from } }
// time·from 둘 다 비우면 그 차량의 수정값을 지운다(엑셀 값으로 되돌림).
// ponytail: 날짜별 JSON 한 덩어리를 읽고-고쳐-쓰기 — 두 사람이 같은 순간 저장하면 한쪽이 덮일 수 있음. 잦아지면 테이블(date, plate)로.

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const date = String(body?.date ?? "");
  const plate = String(body?.plate ?? "").trim().slice(0, 30);
  const time = String(body?.time ?? "").trim();
  const from = String(body?.from ?? "").trim().slice(0, 50);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !plate) return bad("날짜와 차량번호를 확인하세요.");
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return bad("시간을 확인하세요.");

  const key = `done_edit:${date}`;
  // 읽기 실패를 '없음'으로 보면 남의 수정값을 통째로 덮어쓰므로 여기서는 오류를 그대로 돌려준다
  const { data, error } = await createServiceClient().from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) return bad(`저장 실패: ${error.message}`, 500);
  let edits: Record<string, { time: string; from: string }> = {};
  try {
    edits = JSON.parse(data?.value ?? "{}") ?? {};
  } catch {
    edits = {};
  }
  if (time || from) edits[plate] = { time, from };
  else delete edits[plate];
  try {
    await setSetting(key, JSON.stringify(edits));
  } catch (e) {
    return bad(`저장 실패: ${e instanceof Error ? e.message : ""}`, 500);
  }
  return NextResponse.json({ ok: true });
}
