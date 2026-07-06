// 응답을 먼저 돌려보낸 뒤 마무리 작업(옛 파일 삭제, 팀즈 알림 등)을 백그라운드로 실행.
// Vercel에서는 waitUntil로 완료를 보장하고, 로컬 dev 등 미지원 환경에서는 그냥 실행된다.

import { waitUntil } from "@vercel/functions";

export function runAfterResponse(task: () => Promise<unknown>): void {
  const p = task().catch((e) => {
    console.warn("[background] 작업 실패:", e instanceof Error ? e.message : e);
  });
  try {
    waitUntil(p);
  } catch {
    // waitUntil 미지원 환경 — 프로세스가 살아있는 동안 그대로 실행됨
  }
}
