"use server";

import { revalidateTag } from "next/cache";

// 대시보드 집계는 unstable_cache(tags:["dashboard"], 60초)로 캐시된다.
// 새로고침 버튼이 이 액션을 호출해 캐시를 무효화하면, 다음 렌더에서 최신 데이터로 다시 집계된다.
export async function refreshDashboard() {
  revalidateTag("dashboard");
}
