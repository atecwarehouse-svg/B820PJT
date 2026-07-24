import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { isAdmin } from "@/lib/admin-auth";
import AdminLogin from "@/components/AdminLogin";
import SafetyManager, { type PledgeSessionRow } from "@/components/SafetyManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SafetyPage() {
  // 작업자 서명 링크(/safety/[id])는 게이트 없이 열리고, 관리 화면만 잠근다.
  if (!isAdmin()) return <AdminLogin />;

  const supabase = createServiceClient();

  const { data: sessions } = await supabase
    .from("pledge_sessions")
    .select("id, manager_name, operator, location, install_date, end_time, ended_at")
    .order("created_at", { ascending: false });

  // 세션별 서명자 수 집계 — 누적 서명이 1000행을 넘으면 1회 요청 상한에
  // 조용히 잘려 서명자 수가 줄어 보이므로 전수 페이지네이션으로 조회
  const sigs = await fetchAll<{ session_id: string }>((from, to) =>
    supabase.from("pledge_signatures").select("session_id").order("id").range(from, to),
  ).catch(() => [] as { session_id: string }[]);
  const counts = new Map<string, number>();
  for (const row of sigs ?? []) {
    const k = row.session_id as string;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const rows: PledgeSessionRow[] = (sessions ?? []).map((s) => ({
    id: s.id as string,
    manager_name: s.manager_name as string,
    operator: (s.operator as string | null) ?? null,
    location: (s.location as string | null) ?? null,
    install_date: s.install_date as string,
    signer_count: counts.get(s.id as string) ?? 0,
    ended: Boolean(s.ended_at),
    end_time: (s.end_time as string | null) ?? null,
  }));

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-16 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-blue-600 active:text-blue-800">
          ← 차량 입력
        </Link>
        <h1 className="text-base font-bold text-gray-800">안전관리 서약서</h1>
        <span className="w-14" />
      </div>
      <SafetyManager sessions={rows} />
    </main>
  );
}
