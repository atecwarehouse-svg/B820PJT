// 프로젝트 컨텍스트 — 한 앱에서 여러 "앨범 프로젝트"를 서비스한다.
//   B820 = 기본 프로젝트(slug "b820"), 데이터는 public 스키마, 주소는 접두사 없음(기존 그대로).
//   그 외 앨범 프로젝트 = 자기 스키마(slug 이름), 주소는 /p/<slug>/… (middleware.ts가 접두사를 떼고
//   x-project 헤더를 붙인다). 레지스트리는 public.projects (supabase/migration_projects.sql).
//
// 서버 전용(next/headers 사용). 클라이언트의 경로 접두사 처리는 components/PLink.tsx.

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { colorKey, iconKey, type ColorKey, type IconKey } from "@/components/ProjectIcon";

export const DEFAULT_SLUG = "b820";
export const SLUG_RE = /^[a-z][a-z0-9_]{1,19}$/;

export interface Project {
  slug: string;
  kind: "album" | "link";
  name: string;
  description: string;
  icon: IconKey;
  color: ColorKey;
  url: string | null; // link 카드 전용
  driveFolderId: string | null; // album(비기본) 전용 — null이면 env GDRIVE_FOLDER_ID
  adminPasswordHash: string | null; // album(비기본) 전용 — null이면 env ADMIN_PASSWORD
  sort: number;
  createdAt: string;
}

// B820 기본값 — DB(public.projects) 행이 없어도(마이그레이션 전) 동작하게 코드에 둔다.
export const B820: Project = {
  slug: DEFAULT_SLUG,
  kind: "album",
  name: "B820 설치 사진첩",
  description: "인천버스 단말기 설치",
  icon: "bus",
  color: "blue",
  url: null,
  driveFolderId: null,
  adminPasswordHash: null,
  sort: -1,
  createdAt: "",
};

export const isDefault = (slug: string) => slug === DEFAULT_SLUG;

/** slug → Postgres 스키마명 */
export function schemaOf(slug: string): string {
  return isDefault(slug) ? "public" : slug;
}

/** 현재 요청의 프로젝트 slug. 접두사 없는 요청(x-project 헤더 없음)은 B820.
 *  요청 스코프 밖(unstable_cache 콜백·응답 후 백그라운드·크론)에서는 headers()가 없어 throw 한다 —
 *  조용히 public으로 떨어지면 다른 프로젝트 화면에 B820 데이터가 섞이므로 일부러 실패시킨다.
 *  그런 곳은 createServiceClient(slug) / 로더의 slug 인자로 명시할 것. */
export function currentSlug(): string {
  let h: Headers;
  try {
    h = headers();
  } catch {
    throw new Error(
      "프로젝트 컨텍스트 없음 — unstable_cache·백그라운드·크론에서는 createServiceClient(slug)와 로더 slug 인자를 명시하세요",
    );
  }
  const v = h.get("x-project");
  if (!v) return DEFAULT_SLUG;
  if (!SLUG_RE.test(v)) notFound();
  return v;
}

type Row = {
  slug: string;
  kind: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  url: string | null;
  drive_folder_id: string | null;
  admin_password_hash: string | null;
  sort: number | null;
  created_at: string | null;
};

function fromRow(r: Row): Project {
  return {
    slug: r.slug,
    kind: r.kind === "link" ? "link" : "album",
    name: String(r.name ?? "").trim() || r.slug,
    description: String(r.description ?? "").trim(),
    icon: iconKey(r.icon),
    color: colorKey(r.color),
    url: r.url ?? null,
    driveFolderId: r.drive_folder_id ?? null,
    adminPasswordHash: r.admin_password_hash ?? null,
    sort: r.sort ?? 0,
    createdAt: r.created_at ?? "",
  };
}

const ROW_COLS =
  "slug, kind, name, description, icon, color, url, drive_folder_id, admin_password_hash, sort, created_at";

// 모듈 캐시(웜 인스턴스, 60초) — 요청마다 레지스트리를 다시 읽지 않도록
const cache = new Map<string, { at: number; p: Project | null }>();
const TTL = 60_000;

/** 레지스트리 조회. b820은 행이 없어도 코드 기본값으로 돌려준다. 그 외는 없으면 null. */
export async function getProject(slug: string): Promise<Project | null> {
  if (!SLUG_RE.test(slug)) return null;
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  let p: Project | null = null;
  try {
    const { data } = await createServiceClient(DEFAULT_SLUG)
      .from("projects")
      .select(ROW_COLS)
      .eq("slug", slug)
      .maybeSingle();
    p = data ? fromRow(data as Row) : null;
  } catch {
    p = null;
  }
  if (!p && isDefault(slug)) p = B820;
  cache.set(slug, { at: Date.now(), p });
  return p;
}

export function invalidateProjectCache(slug?: string): void {
  if (slug) cache.delete(slug);
  else cache.clear();
}

/** 현재 요청의 프로젝트. 레지스트리에 없는 slug는 404. */
export async function currentProject(): Promise<Project> {
  const p = await getProject(currentSlug());
  if (!p) notFound();
  return p;
}

/** 런처·크론용 전체 목록(sort, created_at 순).
 *  레지스트리 테이블이 아직 없으면(migration_projects.sql 실행 전) 예전 저장 방식
 *  (app_settings.projects JSON 링크 카드 + b820_card_color)으로 읽어 런처가 비지 않게 한다. */
export async function listProjects(): Promise<Project[]> {
  try {
    const sb = createServiceClient(DEFAULT_SLUG);
    const { data, error } = await sb
      .from("projects")
      .select(ROW_COLS)
      .order("sort")
      .order("created_at");
    if (!error && data) {
      const list = (data as Row[]).map(fromRow);
      if (!list.some((p) => isDefault(p.slug))) list.unshift(B820);
      return list;
    }
    return await legacyProjects(sb);
  } catch {
    return [B820];
  }
}

// 마이그레이션 전 폴백 — app_settings.projects(JSON 링크 카드)·b820_card_color
async function legacyProjects(sb: ReturnType<typeof createServiceClient>): Promise<Project[]> {
  const { data } = await sb.from("app_settings").select("key, value").in("key", ["projects", "b820_card_color"]);
  const rows = (data ?? []) as { key: string; value: string }[];
  const b820 = { ...B820, color: colorKey(rows.find((r) => r.key === "b820_card_color")?.value) };
  let links: Project[] = [];
  try {
    const arr = JSON.parse(rows.find((r) => r.key === "projects")?.value ?? "[]");
    if (Array.isArray(arr)) {
      links = arr
        .filter((v) => v && typeof v.id === "string" && typeof v.name === "string" && typeof v.url === "string")
        .map((v) => ({
          slug: v.id as string,
          kind: "link" as const,
          name: String(v.name).trim(),
          description: String(v.description ?? "").trim(),
          icon: iconKey(v.icon),
          color: colorKey(v.color),
          url: String(v.url),
          driveFolderId: null,
          adminPasswordHash: null,
          sort: 0,
          createdAt: String(v.created_at ?? ""),
        }));
    }
  } catch {
    links = [];
  }
  return [b820, ...links];
}

/** 카드 제목·파일명·메일에 쓰는 짧은 이름 — B820 출력은 기존과 바이트 동일하게 "B820". */
export function brandName(p: Project): string {
  return isDefault(p.slug) ? "B820" : p.name;
}

/** 프로젝트 홈 경로 */
export function projectHome(slug: string): string {
  return isDefault(slug) ? "/b820" : `/p/${slug}`;
}

/** 서버에서 프로젝트 접두사를 붙인 경로 (클라이언트는 PLink.withPrefix) */
export function projectPath(slug: string, href: string): string {
  if (isDefault(slug) || !href.startsWith("/")) return href;
  if (href === "/b820") return `/p/${slug}`;
  return `/p/${slug}${href}`;
}
