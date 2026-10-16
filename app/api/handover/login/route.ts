import { NextRequest, NextResponse } from "next/server";
import { progressDownloadPassword } from "@/lib/admin-auth";
import { currentSlug } from "@/lib/project";
import { WORKER_MAX_AGE, centerNames, getCenters, getWorkers, workerCookieName, workerCookieValue } from "@/lib/handover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 양도양수 작업자 로그인
//   GET    → { centers: string[], workers: [{center,rank,name}] }  로그인 화면 명단(공개 — 이름만)
//   POST   { password, center, name } → 직원 비밀번호(프로젝트 shared_password) 일치 + 명단에 있으면 쿠키 hw_<slug> 발급(30일)
//   DELETE → 쿠키 삭제(다른 사람으로 변경)
export async function GET() {
  const [centers, workers] = await Promise.all([getCenters(), getWorkers()]);
  return NextResponse.json({ centers: centerNames(centers, workers), workers });
}

export async function POST(req: NextRequest) {
  const slug = currentSlug();
  const body = (await req.json().catch(() => null)) as { password?: unknown; center?: unknown; name?: unknown } | null;
  const password = String(body?.password ?? "");
  const center = String(body?.center ?? "").trim();
  const name = String(body?.name ?? "").trim();
  if (!password || password !== (await progressDownloadPassword(slug))) {
    return NextResponse.json({ error: "직원 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  const w = (await getWorkers(slug)).find((x) => x.center === center && x.name === name);
  if (!w) return NextResponse.json({ error: "명단에 없는 작업자입니다. 관리자에게 등록을 요청하세요." }, { status: 400 });
  const res = NextResponse.json({ ok: true, worker: w });
  res.cookies.set(workerCookieName(slug), await workerCookieValue(slug, w), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WORKER_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(workerCookieName(currentSlug()), "", { path: "/", maxAge: 0 });
  return res;
}
