import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkAdminPassword, cookieToken, isAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  DEFAULT_SLUG,
  SLUG_RE,
  invalidateProjectCache,
  isDefault,
  projectHome,
} from "@/lib/project";
import { colorKey, iconKey } from "@/components/ProjectIcon";
import { createProjectFolder, deleteFolder, folderLink, renameFile, setLinkSharing, trashFile } from "@/lib/gdrive";
import { TEMPLATE_BUCKET } from "@/lib/template-path";
import { PHOTO_SLOTS_KEY } from "@/lib/settings";
import { toSlotConfigJson, validateSlotConfig } from "@/lib/slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 프로젝트 레지스트리(public.projects) 관리 — 런처(마스터=B820) 관리자 쿠키 또는 body.pw 필수.
//   POST   { kind:"link",  name, description, icon, color, url }                       → 링크 카드 추가
//   POST   { kind:"album", slug, name, description, icon, color, admin_password, shareLink?, photoSlots? } → 앨범 프로젝트 생성 (shareLink: 드라이브 폴더를 링크 공유로, photoSlots: 사진 양식 SlotConfigJson — 없으면 B820 기본)
//            (드라이브 폴더 → DB 스키마 복제(create_project_schema) → 레지스트리 행. 실패 시 되감기)
//   PUT    { slug, name?, description?, icon?, color?, url?, admin_password?, shareLink? } → 수정 (b820은 색만, 앨범 이름 변경 시 드라이브 폴더명도 변경, shareLink: 드라이브 링크 공유 켜기/끄기)
//   DELETE { slug }                     → 링크 카드 삭제
//   DELETE { slug, confirm: <slug> }    → 앨범 프로젝트 삭제 (DB 스키마·양식 삭제, 드라이브 사진 폴더 영구 삭제. B820 불가)

type Body = Record<string, unknown>;

const RESERVED = new Set([
  "public", "b820", "storage", "auth", "extensions", "graphql", "graphql_public", "realtime",
  "vault", "net", "pgsodium", "pgsodium_masks", "supabase_functions", "supabase_migrations",
  "information_schema", "cron", "pgbouncer", "repack", "tiger", "topology", "api", "p", "projects",
]);

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const unauthorized = () => bad("관리자 비밀번호가 올바르지 않습니다.", 401);

async function authorized(body: Body): Promise<boolean> {
  return (await isAdmin(DEFAULT_SLUG)) || (await checkAdminPassword(body.pw, DEFAULT_SLUG));
}

async function readBody(req: NextRequest): Promise<Body | null> {
  return (await req.json().catch(() => null)) as Body | null;
}

function validUrl(url: string): boolean {
  if (url.startsWith("/")) return true; // 이 앱 안의 경로
  try {
    return /^https?:$/.test(new URL(url).protocol);
  } catch {
    return false;
  }
}

// DB 오류 메시지에 사용자가 할 일을 덧붙인다
function hint(message: string): string {
  if (/create_project_schema|drop_project_schema|relation .*projects/i.test(message)) {
    return `${message} — supabase/migration_projects.sql 을 Supabase SQL Editor에서 먼저 실행하세요.`;
  }
  return message;
}

// Supabase Management API로 PostgREST 노출 스키마에 추가 — SQL 함수가 권한 부족으로 못 했을 때의 폴백.
// Vercel env SUPABASE_ACCESS_TOKEN(개인 액세스 토큰)·SUPABASE_PROJECT_REF 가 있어야 동작.
async function exposeSchemaViaApi(slug: string): Promise<boolean> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) return false;
  const url = `https://api.supabase.com/v1/projects/${ref}/postgrest`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  try {
    const cur = (await fetch(url, { headers }).then((r) => (r.ok ? r.json() : null))) as
      | { db_schema?: string }
      | null;
    const list = String(cur?.db_schema ?? "public, graphql_public")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!list.includes(slug)) list.push(slug);
    const r = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ db_schema: list.join(", ") }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = await readBody(req);
  if (!body) return bad("요청 형식이 잘못되었습니다.");
  if (!(await authorized(body))) return unauthorized();

  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  if (!name) return bad("프로젝트명을 입력하세요.");
  if (name.length > 40 || description.length > 100) {
    return bad("프로젝트명 40자·설명 100자 이하로 입력하세요.");
  }
  const icon = iconKey(body.icon);
  const color = colorKey(body.color);
  const sb = createServiceClient(DEFAULT_SLUG);

  const { count, error: countErr } = await sb
    .from("projects")
    .select("slug", { count: "exact", head: true });
  if (countErr) return bad(hint(countErr.message), 500);
  if ((count ?? 0) >= 30) return bad("프로젝트는 30개까지 등록할 수 있습니다.");

  if (body.kind === "album") {
    const slug = String(body.slug ?? "").trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      return bad("프로젝트 ID는 영문 소문자로 시작하는 소문자·숫자·_ 2~20자여야 합니다. (예: b900)");
    }
    if (RESERVED.has(slug) || slug.startsWith("pg_")) return bad("쓸 수 없는 프로젝트 ID입니다.");
    const pw = String(body.admin_password ?? "");
    if (pw.length < 4) return bad("프로젝트 관리자 비밀번호는 4자 이상으로 정하세요.");
    const { data: dup } = await sb.from("projects").select("slug").eq("slug", slug).maybeSingle();
    if (dup) return bad("이미 있는 프로젝트 ID입니다.");
    // 사진 양식(선택) — 폴더·DB 만들기 전에 먼저 검증
    let slotsJson: string | undefined;
    if (body.photoSlots != null) {
      const c = validateSlotConfig(body.photoSlots);
      if (typeof c === "string") return bad("사진 양식: " + c);
      slotsJson = JSON.stringify(toSlotConfigJson(c));
    }

    // 1) 드라이브 폴더
    let folderId: string;
    try {
      folderId = await createProjectFolder(name);
    } catch (e) {
      return bad("구글드라이브 폴더 생성 실패: " + (e instanceof Error ? e.message : String(e)), 500);
    }

    // 2) DB 스키마 복제 (public → <slug>)
    const { data: rpc, error: rpcErr } = await sb.rpc("create_project_schema", { slug });
    if (rpcErr) {
      await deleteFolder(folderId).catch(() => {}); // 방금 만든 빈 폴더 되감기
      return bad("프로젝트 DB 생성 실패: " + hint(rpcErr.message), 500);
    }
    let exposed = !!(rpc as { exposed?: boolean } | null)?.exposed;
    let warning: string | undefined;
    // 드라이브 폴더 링크 공유(보기) — 실패해도 프로젝트는 만들어지고 경고만
    let driveShared = false;
    if (body.shareLink === true) {
      try {
        await setLinkSharing(folderId, true);
        driveShared = true;
      } catch {
        warning = "구글드라이브 폴더 링크 공유 설정에 실패했습니다. 프로젝트 수정에서 다시 켜거나 드라이브에서 직접 공유하세요.";
      }
    }
    if (!exposed) {
      exposed = await exposeSchemaViaApi(slug);
      if (!exposed) {
        warning =
          "DB는 만들어졌지만 API 노출 설정이 자동으로 되지 않았습니다. Supabase 대시보드 → Settings → API → Exposed schemas 에 '" +
          slug +
          "' 을(를) 추가하거나, Vercel 환경변수 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 를 넣어 주세요. 그 전까지 이 프로젝트는 열리지 않습니다.";
      }
    }

    // 3) 레지스트리 행
    const { error: insErr } = await sb.from("projects").insert({
      slug,
      kind: "album",
      name,
      description,
      icon,
      color,
      drive_folder_id: folderId,
      admin_password_hash: cookieToken(slug, pw),
    });
    if (insErr) {
      const { error: dropErr } = await sb.rpc("drop_project_schema", { slug });
      await deleteFolder(folderId).catch(() => {});
      return bad(
        "프로젝트 등록 실패: " +
          hint(insErr.message) +
          (dropErr ? ` (되감기 실패: ${dropErr.message} — SQL에서 select drop_project_schema('${slug}') 실행 필요)` : ""),
        500,
      );
    }
    invalidateProjectCache();

    // 4) (선택) 사진 양식 저장 — 새 스키마가 PostgREST에 막 노출된 직후라 캐시 갱신 전이면
    //    실패할 수 있어 짧게 재시도한다.
    let photoSlots = false;
    if (slotsJson && exposed) {
      const dst = createServiceClient(slug);
      for (let attempt = 0; attempt < 4 && !photoSlots; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 700));
        const { error } = await dst
          .from("app_settings")
          .upsert({ key: PHOTO_SLOTS_KEY, value: slotsJson, updated_at: new Date().toISOString() }, { onConflict: "key" });
        if (!error) photoSlots = true;
      }
      if (!photoSlots) {
        warning = (warning ? warning + " " : "") + "사진 양식 저장은 실패했습니다. 관리자 '사진 양식' 탭에서 다시 지정하세요.";
      }
    }
    return NextResponse.json({ ok: true, slug, home: projectHome(slug), exposed, warning, photoSlots, driveFolder: folderLink(folderId), driveShared });
  }

  // 링크 카드
  const url = String(body.url ?? "").trim();
  if (!validUrl(url)) return bad("앱 주소는 https://… 형식으로 입력하세요.");
  const { error } = await sb.from("projects").insert({
    slug: randomUUID(),
    kind: "link",
    name,
    description,
    icon,
    color,
    url,
  });
  if (error) return bad("저장 실패: " + hint(error.message), 500);
  invalidateProjectCache();
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const body = await readBody(req);
  if (!body) return bad("요청 형식이 잘못되었습니다.");
  if (!(await authorized(body))) return unauthorized();

  const slug = String(body.slug ?? "");
  const sb = createServiceClient(DEFAULT_SLUG);
  const { data: row, error: rowErr } = await sb
    .from("projects")
    .select("slug, kind, name, drive_folder_id")
    .eq("slug", slug)
    .maybeSingle();
  if (rowErr) return bad(hint(rowErr.message), 500);
  if (!row) return bad("해당 프로젝트가 없습니다.");

  const patch: Record<string, unknown> = {};
  if (body.color !== undefined) patch.color = colorKey(body.color);
  if (!isDefault(slug)) {
    if (body.name !== undefined) {
      const name = String(body.name ?? "").trim();
      if (!name || name.length > 40) return bad("프로젝트명은 1~40자로 입력하세요.");
      patch.name = name;
    }
    if (body.description !== undefined) {
      const d = String(body.description ?? "").trim();
      if (d.length > 100) return bad("설명은 100자 이하로 입력하세요.");
      patch.description = d;
    }
    if (body.icon !== undefined) patch.icon = iconKey(body.icon);
    if (row.kind === "link" && body.url !== undefined) {
      const url = String(body.url ?? "").trim();
      if (!validUrl(url)) return bad("앱 주소는 https://… 형식으로 입력하세요.");
      patch.url = url;
    }
    if (row.kind === "album" && typeof body.admin_password === "string" && body.admin_password) {
      if (body.admin_password.length < 4) return bad("프로젝트 관리자 비밀번호는 4자 이상으로 정하세요.");
      patch.admin_password_hash = cookieToken(slug, body.admin_password);
    }
  }
  const shareLink = row.kind === "album" && row.drive_folder_id && typeof body.shareLink === "boolean" ? body.shareLink : undefined;
  if (!Object.keys(patch).length && shareLink === undefined) return bad("바꿀 내용이 없습니다.");

  if (Object.keys(patch).length) {
    const { error } = await sb.from("projects").update(patch).eq("slug", slug);
    if (error) return bad("저장 실패: " + hint(error.message), 500);
    invalidateProjectCache(slug);
  }
  let warning: string | undefined;
  // 드라이브 폴더 링크 공유 켜기/끄기 (실패해도 나머지 수정은 유지)
  if (shareLink !== undefined) {
    await setLinkSharing(row.drive_folder_id as string, shareLink).catch(() => {
      warning = "구글드라이브 폴더 링크 공유 설정에 실패했습니다. 드라이브에서 직접 바꿔 주세요.";
    });
  }
  // 앨범 프로젝트명이 바뀌면 드라이브 사진 폴더 이름도 같이 (실패해도 프로젝트 수정은 유지)
  if (row.kind === "album" && row.drive_folder_id && typeof patch.name === "string" && patch.name !== row.name) {
    await renameFile(row.drive_folder_id, patch.name).catch(() => {
      warning = (warning ? warning + " " : "") + "프로젝트는 수정됐지만 구글드라이브 폴더 이름 변경에 실패했습니다. 드라이브에서 직접 바꿔 주세요.";
    });
  }
  return NextResponse.json({ ok: true, warning });
}

export async function DELETE(req: NextRequest) {
  const body = await readBody(req);
  if (!body) return bad("요청 형식이 잘못되었습니다.");
  if (!(await authorized(body))) return unauthorized();

  const slug = String(body.slug ?? "");
  const sb = createServiceClient(DEFAULT_SLUG);
  const { data: row, error: rowErr } = await sb
    .from("projects")
    .select("slug, kind, drive_folder_id")
    .eq("slug", slug)
    .maybeSingle();
  if (rowErr) return bad(hint(rowErr.message), 500);
  if (!row) return bad("해당 프로젝트가 없습니다.");

  if (row.kind === "album") {
    // 앨범 프로젝트 삭제 = DB 스키마(차량·기록·사진 메타·서약서…) 통째 삭제 + 양식 삭제 + 드라이브 사진 폴더 영구 삭제.
    // 되돌릴 수 없으므로 프로젝트 ID를 그대로 입력해 확인받는다. B820은 불가.
    if (isDefault(slug)) return bad("B820은 삭제할 수 없습니다.");
    if (String(body.confirm ?? "").trim() !== slug) {
      return bad("확인을 위해 프로젝트 ID를 똑같이 입력하세요.");
    }
    // 실패할 수 있는 DB 삭제를 먼저 — 성공한 뒤에만 양식·드라이브를 정리(반쯤 지워진 상태 방지)
    const { error } = await sb.rpc("drop_project_schema", { slug }); // 스키마 + 레지스트리 행
    if (error) return bad("삭제 실패: " + hint(error.message), 500);
    const st = sb.storage.from(TEMPLATE_BUCKET);
    const { data: objs } = await st.list(slug);
    if (objs?.length) await st.remove(objs.map((o) => `${slug}/${o.name}`)).catch(() => {});
    // 드라이브 사진 폴더(운수사·차량 폴더·사진 포함) 영구 삭제 — 안 되면 휴지통으로라도 옮기고 결과를 알린다
    let drive: "deleted" | "trashed" | "failed" | "none" = "none";
    if (row.drive_folder_id) {
      drive = await deleteFolder(row.drive_folder_id)
        .then(() => "deleted" as const)
        .catch(() => trashFile(row.drive_folder_id as string).then(() => "trashed" as const).catch(() => "failed" as const));
    }
    invalidateProjectCache(slug);
    return NextResponse.json({ ok: true, drive });
  }

  const { error } = await sb.from("projects").delete().eq("slug", slug);
  if (error) return bad("삭제 실패: " + hint(error.message), 500);
  invalidateProjectCache(slug);
  return NextResponse.json({ ok: true });
}
