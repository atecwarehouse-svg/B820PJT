import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import type { RecordRow } from "@/lib/types";
import ListClient, { type ListItem } from "@/components/ListClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ListPage() {
  const supabase = createServiceClient();

  // 1,000행 제한 회피 — 저장 레코드/사진을 전수 조회. 운수사 목록은 집계뷰에서.
  const [records, photoRows, opRes] = await Promise.all([
    fetchAll<RecordRow>((from, to) =>
      supabase
        .from("records")
        .select("*")
        .not("saved_at", "is", null)
        .order("saved_at", { ascending: false })
        .range(from, to),
    ),
    fetchAll<{ plate: string }>((from, to) =>
      supabase.from("photos").select("plate").range(from, to),
    ),
    supabase
      .from("operator_progress")
      .select("operator, complete, in_progress")
      .range(0, 9999),
  ]);

  const photoCount = new Map<string, number>();
  for (const p of photoRows) {
    photoCount.set(p.plate, (photoCount.get(p.plate) ?? 0) + 1);
  }

  const items: ListItem[] = records.map((r) => ({
    plate: r.plate,
    operator: r.operator ?? "",
    route: r.route ?? "",
    installDate: r.install_date,
    year: r.year ?? "",
    model: r.model ?? "",
    photoCount: photoCount.get(r.plate) ?? 0,
  }));

  // 작업 시작된(사진 있는) 운수사만 — 운수사별 저장 드롭다운용
  const operators = ((opRes.data ?? []) as { operator: string; complete: number; in_progress: number }[])
    .filter((o) => (o.complete ?? 0) + (o.in_progress ?? 0) > 0)
    .map((o) => o.operator)
    .sort((a, b) => a.localeCompare(b, "ko"));

  return (
    <main className="mx-auto max-w-3xl px-3 pb-28 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/" className="text-sm text-blue-600">
          ← 차량 입력
        </Link>
        <h1 className="text-lg font-bold text-blue-700">저장 목록</h1>
        <span className="text-xs text-gray-400">{items.length}대</span>
      </div>

      <ListClient items={items} operators={operators} />
    </main>
  );
}
