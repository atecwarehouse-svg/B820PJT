// 앱 설정(키/값) 읽기·쓰기 — app_settings 테이블 (migration_settings.sql).
// 관리자 페이지에서 수정하는 값(완료리포트 수신자 등)을 저장한다.

import { createServiceClient } from "@/lib/supabase/server";

export const REPORT_MAIL_KEY = "report_mail_to";
export const INSTALL_TEAMS_KEY = "install_teams"; // 설치팀 목록 (JSON 배열 문자열)

// 설치팀 목록 읽기 — 미설정/테이블 미생성이면 빈 배열 (기록 페이지는 자유입력으로 폴백)
export async function getInstallTeams(): Promise<string[]> {
  const raw = await getSetting(INSTALL_TEAMS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map((v) => String(v).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

// 값 읽기. 행 없음/테이블 미생성 등 오류 시 null → 호출측에서 env 폴백.
export async function getSetting(key: string): Promise<string | null> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return typeof data.value === "string" ? data.value : null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    // 테이블 미생성이면 마이그레이션 안내를 붙여 사용자에게 보여줌
    const hint = /app_settings/.test(error.message)
      ? " — supabase/migration_settings.sql 을 Supabase SQL Editor에서 실행하세요."
      : "";
    throw new Error(error.message + hint);
  }
}
