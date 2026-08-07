// 앱 설정(키/값) 읽기·쓰기 — app_settings 테이블 (migration_settings.sql).
// 관리자 페이지에서 수정하는 값(완료리포트 수신자 등)을 저장한다.

import { createServiceClient } from "@/lib/supabase/server";

export const REPORT_MAIL_KEY = "report_mail_to";
export const INSTALL_TEAMS_KEY = "install_teams"; // 설치팀 목록 (JSON [{team,name,phone}], 구버전 문자열 배열 호환)
export const INSPECT_CHECKLIST_KEY = "inspect_checklist"; // 배차표 검수항목 (JSON {vehicle,device})

// 업무일별 설치시작 보고 현황 — JSON {운수사: [담당 검수자…]}.
// 두 가지를 겸한다: (1) 보고 완료 운수사 잠금(키 존재 여부), (2) 그날 담당 검수자 배정
// (설치시작·완료 팀즈 카드를 담당자 개인방으로 보내는 라우팅 기준).
export const startReportKey = (date: string) => `start_report_sent:${date}`;

// 저장값 → {운수사: [검수자…]}.
// 구버전 값 호환 필수: 담당자 도입 전에는 운수사 문자열 배열(["삼환교통", …])로 저장했다.
// 이걸 잘못 읽으면 그날의 보고 완료 잠금이 통째로 풀린다.
//
// 반환값은 프로토타입 없는 객체다. 운수사명을 키로 쓰기 때문에 일반 객체면
// "toString"·"constructor" 같은 이름이 실제로 없는데도 있는 것처럼 조회된다
// (`"toString" in map` → true, `map["constructor"]` → 함수). 그러면 담당자 조회가
// 함수를 반환해 카드 발송이 깨지고, 보고 여부 판정도 잘못된다.
export function parseStartReport(raw: string | null): Record<string, string[]> {
  const out: Record<string, string[]> = Object.create(null);
  let v: unknown;
  try {
    v = JSON.parse(raw ?? "{}");
  } catch {
    return out;
  }
  if (Array.isArray(v)) {
    for (const op of v) if (typeof op === "string") out[op] = [];
    return out;
  }
  if (!v || typeof v !== "object") return out;
  for (const [op, names] of Object.entries(v as Record<string, unknown>)) {
    out[op] = Array.isArray(names) ? names.filter((n): n is string => typeof n === "string") : [];
  }
  return out;
}

/** 화면 표시용 읽기 — 조회 실패는 '기록 없음'으로 처리(잠금이 잠깐 안 보일 뿐). */
export async function getStartReport(date: string): Promise<Record<string, string[]>> {
  return parseStartReport(await getSetting(startReportKey(date)));
}

/** 수정 전 읽기 — 조회 실패 시 던진다.
 *  getSetting은 오류를 삼키고 null을 주기 때문에, 그대로 쓰면 일시적 DB 오류를
 *  '아직 아무도 보고 안 함'으로 오해해 그날 기록 전체를 덮어써 버린다. */
export async function getStartReportForUpdate(date: string): Promise<Record<string, string[]>> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", startReportKey(date))
    .maybeSingle();
  if (error) throw new Error(`보고 기록을 읽지 못했습니다: ${error.message}`);
  return parseStartReport(typeof data?.value === "string" ? data.value : null);
}

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
