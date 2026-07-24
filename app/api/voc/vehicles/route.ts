import { NextResponse } from "next/server";
import { loadInstallProgress } from "@/lib/stats";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/voc/vehicles → 설치 완료 차량 목록(운수사·노선·완료 업무일).
// VOC 접수 팝업이 열릴 때만 호출한다 — 홈 화면은 이 조회를 하지 않으므로
// 현장에서 가장 많이 쓰는 첫 화면이 느려지지 않는다.
export async function GET() {
  try {
    const ip = await loadInstallProgress();

    // 배차표(dispatch_times)의 '나가는 시간'을 붙여 팝업에서 그 순서로 정렬한다.
    // 배차표가 없거나 조회 실패해도 목록 자체는 그대로 내려준다.
    const outTimes = new Map<string, string>();
    try {
      const supabase = createServiceClient();
      // 행이 쌓이면 1회 요청 상한(1000행)에 조용히 잘리므로 전수 페이지네이션으로.
      const data = await fetchAll<{ date: string; plate: string; out_time: string | null }>(
        (from, to) =>
          supabase
            .from("dispatch_times")
            .select("date, plate, out_time")
            .order("date")
            .order("plate")
            .range(from, to),
      );
      for (const r of data ?? []) {
        const t = (r.out_time as string | null) ?? "";
        if (t) outTimes.set(`${r.date as string}|${r.plate as string}`, t);
      }
    } catch {
      // 배차표 없이도 동작 — 정렬만 기본(노선·차량번호)으로 떨어진다
    }

    const list = ip.completedList.map((v) => ({
      ...v,
      outTime: outTimes.get(`${v.workDate}|${v.plate}`) ?? null,
    }));
    return NextResponse.json({ list });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "조회 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
