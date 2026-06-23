import { createClient } from "@supabase/supabase-js";

// 서버 전용 클라이언트 — service_role 키 사용 (RLS 우회, 전체 권한).
// 절대 클라이언트 번들에 import 하지 마세요. API route / 스크립트 전용.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function createServiceClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js fetch 캐시 우회 — 항상 최신 데이터 조회 (캐시된 빈 결과 방지)
      fetch: (url, options = {}) =>
        fetch(url, { ...options, cache: "no-store" }),
    },
  });
}
