import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { isAdmin } from "@/lib/admin-auth";
import { getInstallTeamsFull } from "@/lib/settings";
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
  const [sigs, roster] = await Promise.all([
    fetchAll<{ session_id: string; worker_name: string | null }>((from, to) =>
      supabase
        .from("pledge_signatures")
        .select("session_id, worker_name")
        .order("id")
        .range(from, to),
    ).catch(() => [] as { session_id: string; worker_name: string | null }[]),
    getInstallTeamsFull().catch(() => []),
  ]);
  const counts = new Map<string, number>();
  const signerNames = new Map<string, Set<string>>();
  for (const row of sigs ?? []) {
    const k = row.session_id as string;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    const n = (row.worker_name ?? "").trim();
    if (n) {
      const set = signerNames.get(k) ?? new Set<string>();
      set.add(n);
      signerNames.set(k, set);
    }
  }
  // 미서명 = 등록된 설치팀원(이름 있는 사람) 중 해당 세션에 서명 안 한 인원
  const rosterNames = [...new Set(roster.map((t) => t.name.trim()).filter(Boolean))];

  const rows: PledgeSessionRow[] = (sessions ?? []).map((s) => ({
    id: s.id as string,
    manager_name: s.manager_name as string,
    operator: (s.operator as string | null) ?? null,
    location: (s.location as string | null) ?? null,
    install_date: s.install_date as string,
    signer_count: counts.get(s.id as string) ?? 0,
    unsigned_count:
      rosterNames.length > 0
        ? rosterNames.filter((n) => !signerNames.get(s.id as string)?.has(n)).length
        : null,
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
