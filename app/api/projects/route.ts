import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminPassword, isAdmin } from "@/lib/admin-auth";
import { getProjects, setSetting, PROJECTS_KEY, type Project } from "@/lib/settings";
import { colorKey, iconKey } from "@/components/ProjectIcon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 첫 화면 프로젝트 카드 관리 — 관리자 로그인 쿠키 또는 body.pw(관리자 비밀번호) 필수.
//   POST   { icon, color, name, description, url, pw }     → 추가
//   PUT    { id, icon, color, name, description, url, pw } → 수정
//   DELETE { id, pw }                                       → 삭제
// ponytail: 목록을 통째로 읽고 덮어쓴다 — 동시에 두 명이 저장하면 하나가 유실될 수 있음.
// 관리자 한 명이 가끔 쓰는 기능이라 그대로 둠. 잦아지면 projects 테이블로.

type Body = Record<string, unknown>;

function authorized(pw: unknown): boolean {
  return isAdmin() || (typeof pw === "string" && pw === adminPassword());
}

const unauthorized = () =>
  NextResponse.json({ error: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

function validUrl(url: string): boolean {
  if (url.startsWith("/")) return true; // 이 앱 안의 경로
  try {
    return /^https?:$/.test(new URL(url).protocol);
  } catch {
    return false;
  }
}

// 입력값 정리·검증 — 추가/수정 공용. 실패 시 오류 문구.
function parseFields(body: Body): Omit<Project, "id" | "created_at"> | string {
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const url = String(body.url ?? "").trim();
  if (!name) return "프로젝트명을 입력하세요.";
  if (name.length > 40 || description.length > 100) return "프로젝트명 40자·설명 100자 이하로 입력하세요.";
  if (!validUrl(url)) return "앱 주소는 https://… 형식으로 입력하세요.";
  return { icon: iconKey(body.icon), color: colorKey(body.color), name, description, url };
}

async function readBody(req: NextRequest): Promise<Body | null> {
  return (await req.json().catch(() => null)) as Body | null;
}

async function save(list: Project[]) {
  try {
    await setSetting(PROJECTS_KEY, JSON.stringify(list));
  } catch (e) {
    return NextResponse.json(
      { error: "저장 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const body = await readBody(req);
  if (!body) return bad("요청 형식이 잘못되었습니다.");
  if (!authorized(body.pw)) return unauthorized();
  const fields = parseFields(body);
  if (typeof fields === "string") return bad(fields);

  const list = await getProjects();
  if (list.length >= 30) return bad("프로젝트는 30개까지 등록할 수 있습니다.");
  list.push({ id: randomUUID(), ...fields, created_at: new Date().toISOString() });
  return save(list);
}

export async function PUT(req: NextRequest) {
  const body = await readBody(req);
  if (!body) return bad("요청 형식이 잘못되었습니다.");
  if (!authorized(body.pw)) return unauthorized();
  const fields = parseFields(body);
  if (typeof fields === "string") return bad(fields);

  const id = String(body.id ?? "");
  const list = await getProjects();
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return bad("해당 프로젝트가 없습니다.");
  list[i] = { ...list[i], ...fields };
  return save(list);
}

export async function DELETE(req: NextRequest) {
  const body = await readBody(req);
  if (!body) return bad("요청 형식이 잘못되었습니다.");
  if (!authorized(body.pw)) return unauthorized();

  const id = String(body.id ?? "");
  const list = await getProjects();
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return bad("해당 프로젝트가 없습니다.");
  return save(next);
}
