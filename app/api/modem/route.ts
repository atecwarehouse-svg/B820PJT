import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { uploadPhoto, deletePhoto, downloadPhoto } from "@/lib/gdrive";
import { sendModemDefectCard } from "@/lib/teams";
import { MODEM_FOLDER, MODEM_KINDS, needsPhoto } from "@/lib/modem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 배차표 '모뎀불량' 팝업 저장 — POST (multipart/form-data)
//   date, plate, operator, kind, symptom, beforeSn, afterSn
//   photoAfter(파일, 선택), photoInfo(파일, 선택), clear=1(기록 삭제 → '정상'으로 되돌리기)
//
// 사진은 DB가 아니라 Drive(루트/LTE모뎀불량/운수사명/차량번호)에 올리고 파일 ID만 저장한다.
// 다시 저장하면 새 파일을 올린 뒤 옛 파일을 지운다(자동 교체).
// 차량번호 사진은 작업자가 이미 찍어둔 설치전 '차량번호'(before_plate)를 그대로 복사해 쓴다.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const str = (k: string, max = 100) => String(form.get(k) ?? "").trim().slice(0, max);

  const date = str("date", 10);
  const plate = str("plate", 30);
  const operator = str("operator", 100);
  if (!DATE_RE.test(date) || !plate) {
    return NextResponse.json({ error: "날짜와 차량번호를 확인하세요." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: existing, error: exErr } = await supabase
    .from("modem_defects")
    .select("id, photo_plate, photo_after, photo_info")
    .eq("date", date)
    .eq("plate", plate)
    .maybeSingle();
  if (exErr) {
    const msg = /modem_defects/i.test(exErr.message)
      ? "DB 준비가 안 됐습니다. supabase/migration_modem_defects.sql을 실행해주세요."
      : exErr.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // 정상으로 되돌리기 — 기록과 Drive 사진을 모두 지운다
  if (form.get("clear") === "1") {
    if (existing) {
      const { error } = await supabase.from("modem_defects").delete().eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await Promise.allSettled(
        [existing.photo_plate, existing.photo_after, existing.photo_info]
          .filter((id): id is string => !!id)
          .map((id) => deletePhoto(id)),
      );
    }
    return NextResponse.json({ ok: true, cleared: true });
  }

  const kind = str("kind", 20);
  if (!(MODEM_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "구분(현장교체/증차/예비품불량)을 선택하세요." }, { status: 400 });
  }
  const symptom = str("symptom", 100);
  const beforeSn = str("beforeSn", 50);
  const afterSn = str("afterSn", 50);
  if (!afterSn) {
    return NextResponse.json({ error: "교체 후 모뎀 번호를 입력하세요." }, { status: 400 });
  }

  // 새로 올릴 사진 — 예비품불량은 촬영하지 않으므로 있던 사진도 정리한다
  const withPhoto = needsPhoto(kind);
  const after = withPhoto ? (form.get("photoAfter") as File | null) : null;
  const info = withPhoto ? (form.get("photoInfo") as File | null) : null;

  // 차량번호 사진 = 작업자가 찍어둔 설치전 '차량번호' 사진을 복사(없으면 생략)
  let plateSrc: Buffer | null = null;
  if (withPhoto) {
    const { data: p } = await supabase
      .from("photos")
      .select("storage_path")
      .eq("plate", plate)
      .eq("slot_key", "before_plate")
      .maybeSingle();
    if (p?.storage_path) {
      plateSrc = await downloadPhoto(p.storage_path as string).catch(() => null);
    }
  }

  const up = (fileName: string, body: Buffer) =>
    uploadPhoto({
      plate,
      operator,
      fileName,
      body,
      contentType: "image/jpeg",
      topFolder: MODEM_FOLDER,
    });

  // Drive 업로드 — 실패하면 저장 자체를 막는다(사진 없이 '저장됨'으로 보이면 안 됨)
  const newIds: { photo_plate?: string; photo_after?: string; photo_info?: string } = {};
  try {
    if (plateSrc) newIds.photo_plate = await up(`차량번호_${plate}.jpg`, plateSrc);
    if (after && after.size > 0)
      newIds.photo_after = await up(`LTE교체후_${plate}.jpg`, Buffer.from(await after.arrayBuffer()));
    if (info && info.size > 0)
      newIds.photo_info = await up(`LTE정보_${plate}.jpg`, Buffer.from(await info.arrayBuffer()));
  } catch (e) {
    // 이번에 올린 파일은 고아로 남기지 않는다
    await Promise.allSettled(Object.values(newIds).map((id) => deletePhoto(id)));
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Google Drive 업로드 실패" },
      { status: 500 },
    );
  }

  // 이번에 새로 올린 칸만 교체하고, 안 올린 칸은 기존 파일을 유지한다.
  // 예비품불량(withPhoto=false)이면 전부 비운다.
  const keep = (col: "photo_plate" | "photo_after" | "photo_info") =>
    withPhoto ? (newIds[col] ?? (existing?.[col] as string | null) ?? null) : null;
  const row = {
    date,
    plate,
    operator,
    kind,
    symptom: symptom || null,
    before_sn: beforeSn || null,
    after_sn: afterSn,
    photo_plate: keep("photo_plate"),
    photo_after: keep("photo_after"),
    photo_info: keep("photo_info"),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("modem_defects")
    .upsert(row, { onConflict: "date,plate" });
  if (error) {
    await Promise.allSettled(Object.values(newIds).map((id) => deletePhoto(id)));
    const msg = /modem_defects/i.test(error.message)
      ? "DB 준비가 안 됐습니다. supabase/migration_modem_defects.sql을 실행해주세요."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // DB 저장이 끝난 뒤에야 대체된 옛 파일을 지운다(부분 실패로 사진이 사라지는 것 방지)
  const stale = (["photo_plate", "photo_after", "photo_info"] as const)
    .map((c) => {
      const old = (existing?.[c] as string | null) ?? null;
      return old && old !== row[c] ? old : null;
    })
    .filter((id): id is string => !!id);
  await Promise.allSettled(stale.map((id) => deletePhoto(id)));

  // 팀즈 알림 — 실패해도 저장은 유지하고 경고만 돌려준다
  let teamsError: string | undefined;
  try {
    await sendModemDefectCard({ kind, operator, plate, beforeSn, afterSn });
  } catch (e) {
    teamsError = e instanceof Error ? e.message : "팀즈 전송 실패";
  }

  return NextResponse.json({ ok: true, teamsError });
}
