// 양도양수 체크리스트(kind="handover") — 서버 전용 헬퍼.
//   차량은 그 프로젝트 스키마의 vehicles(plate·operator=영업소·route=노선 + done_at·done_by·note).
//   센터: app_settings.handover_centers = {"영업소명":"센터명"} (영업소→담당 센터)
//   작업자: app_settings.handover_workers = [{center,rank,name}]
//   로그인: 프로젝트 직원 비밀번호(shared_password 키 — 협력업체 공용 비번 자리를 그대로 씀) + 명단에서 이름 선택
//          → httpOnly 쿠키 hw_<slug> = "<sha256(slug:비번)>|<base64url({center,name})>" (비번이 바뀌면 자동 무효)
import { cookies } from "next/headers";
import { cookieToken, progressDownloadPassword } from "@/lib/admin-auth";
import { currentSlug } from "@/lib/project";
import { getSetting } from "@/lib/settings";

export const HANDOVER_CENTERS_KEY = "handover_centers";
export const HANDOVER_WORKERS_KEY = "handover_workers";
export const HANDOVER_WEBHOOK_KEY = "handover_webhook"; // 프로젝트 기본 팀즈 웹훅(Power Automate). 비면 env TEAMS_ADMIN_CALL_WEBHOOK_URL 폴백
export const HANDOVER_WEBHOOKS_KEY = "handover_webhooks"; // 센터별 팀즈 웹훅 {"강남센터":"https://…"} — 그 센터 차량 완료 카드는 여기로(없으면 기본)

/** 웹훅 주소 형식 — https:// (로컬 수신기 테스트용 http://localhost 만 예외) */
export const WEBHOOK_RE = /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])\S+$/;

/** 프로젝트 기본 팀즈 웹훅 URL — 미설정이면 null(카드 쪽에서 env 폴백) */
export async function getWebhook(slug?: string): Promise<string | null> {
  const v = (await getSetting(HANDOVER_WEBHOOK_KEY, slug))?.trim();
  return v && WEBHOOK_RE.test(v) ? v : null;
}

/** 센터별 팀즈 웹훅 {센터: url} */
export async function getWebhooks(slug?: string): Promise<Record<string, string>> {
  try {
    const v = JSON.parse((await getSetting(HANDOVER_WEBHOOKS_KEY, slug)) ?? "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, u] of Object.entries(v as Record<string, unknown>)) {
      if (typeof u === "string" && WEBHOOK_RE.test(u.trim())) out[k] = u.trim();
    }
    return out;
  } catch {
    return {};
  }
}

/** 그 센터 카드가 갈 웹훅 — 센터별 → 프로젝트 기본 → null(env 폴백) */
export async function webhookFor(center: string, slug?: string): Promise<string | null> {
  const [byCenter, base] = await Promise.all([getWebhooks(slug), getWebhook(slug)]);
  return byCenter[center] ?? base;
}
export const WORKER_MAX_AGE = 60 * 60 * 24 * 30; // 30일

export interface Worker {
  center: string;
  rank: string;
  name: string;
}

export type CenterMap = Record<string, string>; // 영업소명 → 센터명

export const workerCookieName = (slug: string) => `hw_${slug}`;

export async function getCenters(slug?: string): Promise<CenterMap> {
  try {
    const v = JSON.parse((await getSetting(HANDOVER_CENTERS_KEY, slug)) ?? "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: CenterMap = {};
    for (const [k, c] of Object.entries(v as Record<string, unknown>)) {
      if (typeof c === "string" && c.trim()) out[k] = c.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export async function getWorkers(slug?: string): Promise<Worker[]> {
  try {
    const v = JSON.parse((await getSetting(HANDOVER_WORKERS_KEY, slug)) ?? "[]");
    if (!Array.isArray(v)) return [];
    return v
      .map((w) => ({
        center: String((w as Worker)?.center ?? "").trim(),
        rank: String((w as Worker)?.rank ?? "").trim(),
        name: String((w as Worker)?.name ?? "").trim(),
      }))
      .filter((w) => w.center && w.name);
  } catch {
    return [];
  }
}

/** 센터명 목록 — 영업소 배정값 ∪ 작업자 소속(순서 유지, 중복 제거) */
export function centerNames(centers: CenterMap, workers: Worker[]): string[] {
  return [...new Set([...Object.values(centers), ...workers.map((w) => w.center)])];
}

/** 그 센터가 담당하는 영업소 목록 */
export function centerOffices(centers: CenterMap, center: string): string[] {
  return Object.entries(centers)
    .filter(([, c]) => c === center)
    .map(([office]) => office);
}

export const workerLabel = (w: Pick<Worker, "rank" | "name">) => (w.rank ? `${w.rank} ${w.name}` : w.name);

export async function workerCookieValue(slug: string, w: Pick<Worker, "center" | "name">): Promise<string> {
  const token = cookieToken(slug, await progressDownloadPassword(slug));
  return `${token}|${Buffer.from(JSON.stringify({ center: w.center, name: w.name }), "utf8").toString("base64url")}`;
}

/** 현재 요청의 로그인 작업자. 토큰(직원 비밀번호)이 맞고 명단에 있는 사람일 때만. */
export async function currentWorker(slug: string = currentSlug()): Promise<Worker | null> {
  const raw = cookies().get(workerCookieName(slug))?.value;
  if (!raw) return null;
  const bar = raw.indexOf("|");
  if (bar < 0) return null;
  const token = raw.slice(0, bar);
  if (token !== cookieToken(slug, await progressDownloadPassword(slug))) return null;
  let id: { center?: unknown; name?: unknown };
  try {
    id = JSON.parse(Buffer.from(raw.slice(bar + 1), "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const workers = await getWorkers(slug);
  return workers.find((w) => w.center === id.center && w.name === id.name) ?? null;
}

export interface HandoverVehicle {
  plate: string;
  operator: string; // 영업소명
  route: string; // 노선(공동배차는 " / " 연결)
  done_at: string | null;
  done_by: string | null;
  note: string | null;
  model: string | null; // 기종 원문(OS업데이트: "서울시내버스(B800)" 등). handover 는 null
  bus_type: string | null; // "시내버스" | "마을버스" | "공항버스" (OS업데이트만, 업로드 때 판정). handover 는 null
  center: string | null; // 차량별 담당 센터(OS업데이트 — 파일 '센터' 열 또는 업로드 때 지정). handover 는 null → 영업소→센터 맵
}

export const VEHICLE_COLS = "plate, operator, route, done_at, done_by, note, model, bus_type, center";

/** 차량의 담당 센터 — 차량 행의 center(OS업데이트) 우선, 없으면 영업소→센터 맵(양도양수), 둘 다 없으면 "미배정" */
export const vehicleCenter = (v: Pick<HandoverVehicle, "operator" | "center">, centers: CenterMap) => v.center ?? centers[v.operator] ?? "미배정";
