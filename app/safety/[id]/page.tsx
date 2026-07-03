import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import SafetySign, {
  type Phase,
  type PledgeSessionInfo,
  type SignerRow,
} from "@/components/SafetySign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SafetySignPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { phase?: string };
}) {
  // 링크로 단계 고정: 기본(설치 전) / ?phase=after(설치 후)
  const phase: Phase = searchParams.phase === "after" ? "after" : "before";
  const supabase = createServiceClient();

  const { data: session } = await supabase
    .from("pledge_sessions")
    .select("id, manager_name, operator, location, install_date, ended_at")
    .eq("id", params.id)
    .maybeSingle();

  if (!session) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-4 pt-16 text-center">
        <p className="text-sm text-gray-500">서약서 링크를 찾을 수 없습니다.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-blue-600">
          ← 처음으로
        </Link>
      </main>
    );
  }

  const { data: sigs } = await supabase
    .from("pledge_signatures")
    .select("id, worker_name, sig_after")
    .eq("session_id", params.id)
    .order("id", { ascending: true });

  const signers: SignerRow[] = (sigs ?? []).map((r) => ({
    id: r.id as number,
    worker_name: r.worker_name as string,
    has_after: Boolean(r.sig_after),
  }));

  const info: PledgeSessionInfo = {
    id: session.id as string,
    manager_name: session.manager_name as string,
    operator: (session.operator as string | null) ?? null,
    location: (session.location as string | null) ?? null,
    install_date: session.install_date as string,
  };

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-16 pt-6">
      <h1 className="mb-4 text-center text-lg font-bold text-blue-700">
        안전관리 서약서 서명
      </h1>
      <SafetySign session={info} signers={signers} ended={Boolean(session.ended_at)} phase={phase} />
    </main>
  );
}
