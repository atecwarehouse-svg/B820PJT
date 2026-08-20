import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { uploadPhoto, deletePhoto, downloadPhoto } from "@/lib/gdrive";
import { sendModemDefectCard } from "@/lib/teams";
import { MODEM_FOLDER, MODEM_KINDS, isNewModem, needsAfterSn, needsPhoto } from "@/lib/modem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 배차표 '모뎀불량' 팝업 저장 — POST (multipart/form-data)
//   date, plate, operator, kind, symptom, beforeSn, afterSn
//   photoAfter(파일, 선택), photoInfo(파일, 선택), photoBack(파일, 선택 — 증차 모뎀 뒷면),
//   clear=1(기록 삭제 → '정상'으로 되돌리기)
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
  // photo_back(증차 모뎀 뒷면)은 migration_modem_back.sql 이후에만 있다 —
  // 아직 없는 DB에서도 나머지 저장은 되도록 컬럼을 빼고 재시도한다.
  let hasBack = true;
  // 컬럼 목록이 동적이라 supabase 타입 추론이 안 된다 — 실제 모양으로 캐스팅해서 쓴다.
  type ExistingRow = {
    id: number;
    photo_plate: string | null;
    photo_after: string | null;
    photo_info: string | null;
    photo_back?: string | null;
  };
  const selectExisting = async () =>
    (await supabase
      .from("modem_defects")
      .select(
        hasBack
          ? "id, photo_plate, photo_after, photo_info, photo_back"
          : "id, photo_plate, photo_after, photo_info",
      )
      .eq("date", date)
      .eq("plate", plate)
      .maybeSingle()) as unknown as {
      data: ExistingRow | null;
      error: { message: string } | null;
    };
  let { data: existing, error: exErr } = await selectExisting();
  if (exErr && /photo_back/i.test(exErr.message)) {
    hasBack = false;
    ({ data: existing, error: exErr } = await selectExisting());
  }
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
        [existing.photo_plate, existing.photo_after, existing.photo_info, existing.photo_back]
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
  const isNew = isNewModem(kind);
  if (!afterSn && needsAfterSn(kind)) {
    return NextResponse.json(
      { error: `${isNew ? "설치" : "교체 후"} 모뎀 번호를 입력하세요.` },
      { status: 400 },
    );
  }

  // 새로 올릴 사진 — 예비품불량은 촬영하지 않으므로 있던 사진도 정리한다
  const withPhoto = needsPhoto(kind);
  const after = withPhoto ? (form.get("photoAfter") as File | null) : null;
  const info = withPhoto ? (form.get("photoInfo") as File | null) : null;
  // 모뎀 뒷면은 증차에서만 받는다
  const back = withPhoto && isNew ? (form.get("photoBack") as File | null) : null;
  // 컬럼이 없으면 뒷면 사진을 기록할 자리가 없다 — 조용히 흘리지 말고 막는다
  if (back && back.size > 0 && !hasBack) {
    return NextResponse.json(
      { error: "DB 준비가 안 됐습니다. supabase/migration_modem_back.sql을 실행해주세요." },
      { status: 500 },
    );
  }

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
  const newIds: {
    photo_plate?: string;
    photo_after?: string;
    photo_info?: string;
    photo_back?: string;
  } = {};
  try {
    if (plateSrc) newIds.photo_plate = await up(`차량번호_${plate}.jpg`, plateSrc);
    if (back && back.size > 0)
      newIds.photo_back = await up(`모뎀뒷면_${plate}.jpg`, Buffer.from(await back.arrayBuffer()));
    if (after && after.size > 0)
      newIds.photo_after = await up(
        `${isNew ? "LTE설치" : "LTE교체후"}_${plate}.jpg`,
        Buffer.from(await after.arrayBuffer()),
      );
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
  const keep = (col: "photo_plate" | "photo_after" | "photo_info" | "photo_back") =>
    withPhoto ? (newIds[col] ?? (existing?.[col] as string | null) ?? null) : null;
  const row: Record<string, unknown> = {
    date,
    plate,
    operator,
    kind,
    symptom: symptom || null,
    before_sn: beforeSn || null,
    after_sn: afterSn || null,
    photo_plate: keep("photo_plate"),
    photo_after: keep("photo_after"),
    photo_info: keep("photo_info"),
    // 뒷면 사진은 증차만 — 구분을 증차에서 바꾸면 기존 파일도 정리된다
    ...(hasBack ? { photo_back: isNew ? keep("photo_back") : null } : {}),
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
  const stale = (["photo_plate", "photo_after", "photo_info", "photo_back"] as const)
    .map((c) => {
      const old = (existing?.[c] as string | null) ?? null;
      return old && old !== (row[c] as string | null) ? old : null;
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
