import Link from "@/components/PLink";
import { brandName, currentProject } from "@/lib/project";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { workDateString } from "@/lib/work-day";
import { isDefaultSlotConfig, photoCount as slotPhotoCount, stdSlotKeys } from "@/lib/slots";
import { getSlotConfig } from "@/lib/settings";
import type { RecordRow } from "@/lib/types";
import ListClient, { type ListItem } from "@/components/ListClient";
import { isAdmin } from "@/lib/admin-auth";
import AdminLogin from "@/components/AdminLogin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 완료 판정 기준 = 프로젝트 사진 양식의 설치전 + 설치후 칸 (lib/stats.ts와 같은 기준)


export default async function ListPage() {
  if (!(await isAdmin())) return <AdminLogin />;

  const supabase = createServiceClient();
  const cfg = await getSlotConfig();
  const STD_SLOT_KEYS = stdSlotKeys(cfg);
  const TARGET = slotPhotoCount(cfg); // 프로젝트 양식의 설치 전+후 칸 수(B820은 14)

  // 1,000행 제한 회피 — 저장 레코드/사진을 전수 조회. 운수사 목록은 집계뷰에서.
  const [records, photoRows, opRes] = await Promise.all([
    fetchAll<RecordRow>((from, to) =>
      supabase
        .from("records")
        .select("*")
        .not("saved_at", "is", null)
        .order("saved_at", { ascending: false })
        .order("plate")
        .range(from, to),
    ),
    // 표준 14칸만 센다 — 사용자가 추가한 칸(before_custom_*) 사진까지 세면
    // 표준 칸이 비어 있어도 '14장/14장 완료'로 보인다(대시보드 집계와 어긋남).
    fetchAll<{ plate: string }>((from, to) =>
      supabase
        .from("photos")
        .select("plate")
        .in("slot_key", STD_SLOT_KEYS)
        .order("id")
        .range(from, to),
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

  // 표준 14칸 슬롯키 — na_slots에 커스텀 칸(before_custom_*)이 섞여 있어도
  // 총수량(14)에서는 표준 칸만 차감해야 필요 사진 수가 과도하게 줄지 않는다.
  const stdKeys = new Set(STD_SLOT_KEYS);
  const items: ListItem[] = records.map((r) => {
    // '단말기 없음'(하차 등) 체크 칸은 촬영 대상에서 빼서 그 차량의 총수량을 줄인다.
    // 예) 하차 4칸 없음 → 10장/10장 완료.
    const naCount = Array.isArray(r.na_slots)
      ? r.na_slots.filter((k) => stdKeys.has(k)).length
      : 0;
    return {
      plate: r.plate,
      operator: r.operator ?? "",
      route: r.route ?? "",
      installDate: r.install_date,
      savedDate: r.saved_at ? workDateString(r.saved_at) : "", // 완료 업무일
      year: r.year ?? "",
      model: r.model ?? "",
      photoCount: photoCount.get(r.plate) ?? 0,
      target: Math.max(1, TARGET - naCount),
    };
  });

  // 작업 시작된(사진 있는) 운수사만 — 운수사별 저장 드롭다운용
  // 집계 뷰는 B820 표준 14칸을 하드코딩했으므로 양식을 바꾼 프로젝트는 저장 목록에서 직접 뽑는다
  const operators = (isDefaultSlotConfig(cfg)
    ? ((opRes.data ?? []) as { operator: string; complete: number; in_progress: number }[])
        .filter((o) => (o.complete ?? 0) + (o.in_progress ?? 0) > 0)
        .map((o) => o.operator)
    : Array.from(new Set(items.filter((i) => i.photoCount > 0).map((i) => i.operator))))
    .sort((a, b) => a.localeCompare(b, "ko"));

  return (
    <main className="mx-auto max-w-3xl px-3 pb-28 pt-4">
      <div className="page-head">
        <Link href="/b820" className="pill">
          ← 차량 입력
        </Link>
        <h1>📋 저장 목록</h1>
        <span className="pill-muted text-xs">{items.length}대</span>
      </div>

      <ListClient items={items} operators={operators} exportTitle={`${brandName(await currentProject())}_설치사진첩`} />
    </main>
  );
}
