// 앱 설정(키/값) 읽기·쓰기 — app_settings 테이블 (migration_settings.sql).
// 관리자 페이지에서 수정하는 값(완료리포트 수신자 등)을 저장한다.

import { createServiceClient } from "@/lib/supabase/server";

export const REPORT_MAIL_KEY = "report_mail_to";
export const INSTALL_TEAMS_KEY = "install_teams"; // 설치팀 목록 (JSON [{team,name,phone}], 구버전 문자열 배열 호환)
export const INSPECT_CHECKLIST_KEY = "inspect_checklist"; // 배차표 검수항목 (JSON {vehicle,device})

export interface InstallTeam {
  team: string; // 팀명 (예: 1팀)
  name: string; // 이름
  phone: string; // 전화번호 (설치팀 호출 버튼에서만 사용, 카드·드롭다운 미노출)
}

// 팀 표시 라벨 = "팀명 이름" — 기록 페이지 드롭다운·팀즈 카드에 쓰이는 문자열
export function teamLabel(t: InstallTeam): string {
  return [t.team, t.name].filter(Boolean).join(" ");
}

// 기록의 팀 표기 통합 — 구기록("부천1")·신기록("부천1 최봉식")을 현재 등록된 팀의
// 라벨("팀명 이름")로 정규화해 같은 팀으로 집계. 등록에 없는 표기는 그대로 둔다.
export function makeTeamNormalizer(installTeams: InstallTeam[]) {
  return (raw: string | null): string => {
    const s = (raw ?? "").trim();
    if (!s) return "팀 미입력";
    for (const t of installTeams) {
      if (s === t.team || s === teamLabel(t) || s.startsWith(t.team + " ")) return teamLabel(t);
    }
    return s;
  };
}

// 설치팀 전체(팀명·이름·전화) 읽기 — 미설정/테이블 미생성이면 빈 배열.
// 구버전 문자열 배열(["1팀"])은 {team:"1팀", name:"", phone:""}로 변환.
export async function getInstallTeamsFull(): Promise<InstallTeam[]> {
  const raw = await getSetting(INSTALL_TEAMS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((v) =>
        typeof v === "string"
          ? { team: v.trim(), name: "", phone: "" }
          : {
              team: String(v?.team ?? "").trim(),
              name: String(v?.name ?? "").trim(),
              phone: String(v?.phone ?? "").trim(),
            },
      )
      .filter((v) => v.team);
  } catch {
    return [];
  }
}

// 설치팀 드롭다운 선택지("팀명 이름") — 기록 페이지용 (비면 자유입력으로 폴백)
export async function getInstallTeams(): Promise<string[]> {
  return (await getInstallTeamsFull()).map(teamLabel);
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
