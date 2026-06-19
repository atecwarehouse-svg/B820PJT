import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import type { RecordRow } from "@/lib/types";
import ListClient, { type ListItem } from "@/components/ListClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ListPage() {
  const supabase = createServiceClient();

  const [recordsRes, photosRes] = await Promise.all([
    supabase
      .from("records")
      .select("*")
      .not("saved_at", "is", null)
      .order("saved_at", { ascending: false }),
    supabase.from("photos").select("plate"),
  ]);

  const records = (recordsRes.data as RecordRow[]) ?? [];
  const photoCount = new Map<string, number>();
  for (const p of (photosRes.data as { plate: string }[]) ?? []) {
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

  return (
    <main className="mx-auto max-w-3xl px-3 pb-28 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/" className="text-sm text-blue-600">
          ← 차량 입력
        </Link>
        <h1 className="text-lg font-bold text-blue-700">저장 목록</h1>
        <span className="text-xs text-gray-400">{items.length}대</span>
      </div>

      {items.length === 0 ? (
        <p className="mt-16 text-center text-sm text-gray-400">
          저장된 사진첩이 없습니다.
          <br />
          차량을 선택해 사진을 올린 뒤 “저장”을 누르세요.
        </p>
      ) : (
        <ListClient items={items} />
      )}
    </main>
  );
}
