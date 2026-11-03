// 기준(예시) 사진 — 칸(slot_key)별 1장, reference_photos 테이블(프로젝트 스키마별) + Drive.
// 촬영 화면의 '예시' 버튼과 관리자 기준사진 페이지가 같이 쓴다.
import { createServiceClient } from "@/lib/supabase/server";
import { publicPhotoUrl } from "@/lib/photo-url";

/** slot_key → 표시 URL (갱신시각 쿼리로 캐시 무효화). 테이블 없음·오류면 빈 객체 */
export async function getReferenceUrls(slug?: string): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  try {
    const { data } = await createServiceClient(slug).from("reference_photos").select("slot_key, storage_path, updated_at");
    for (const r of data ?? []) {
      if (r.storage_path) urls[r.slot_key] = `${publicPhotoUrl(r.storage_path)}?t=${r.updated_at ?? ""}`;
    }
  } catch {
    /* 예시 사진은 부가 기능 — 실패해도 촬영은 가능 */
  }
  return urls;
}
