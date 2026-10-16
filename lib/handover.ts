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
}

export const VEHICLE_COLS = "plate, operator, route, done_at, done_by, note";
