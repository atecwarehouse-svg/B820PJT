import { NextResponse } from "next/server";
import { getInstallTeamPhones } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → 설치팀 연락처 목록 (홈 설치팀 전화 버튼용, 공개)
export async function GET() {
  const list = await getInstallTeamPhones();
  return NextResponse.json({ list });
}
