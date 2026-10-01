import { createClient } from "@supabase/supabase-js";
import { currentSlug, schemaOf } from "@/lib/project";

// 서버 전용 클라이언트 — service_role 키 사용 (RLS 우회, 전체 권한).
// 절대 클라이언트 번들에 import 하지 마세요. API route / 스크립트 전용.
//
// 멀티 프로젝트: 프로젝트마다 Postgres 스키마가 다르다(B820=public, 그 외=slug).
//   - 인자 없이 부르면 현재 요청의 프로젝트(x-project 헤더, 없으면 B820) 스키마를 쓴다.
//   - 요청 스코프 밖(unstable_cache 콜백·응답 후 백그라운드·크론)에서는 반드시 slug를 넘길 것
//     (안 넘기면 currentSlug()가 throw — 다른 프로젝트 데이터가 섞이는 것보다 낫다).
//   - 레지스트리(public.projects)·RPC는 createServiceClient(DEFAULT_SLUG)로.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function createServiceClient(slug?: string) {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  const schema = schemaOf(slug ?? currentSlug());
  return createClient<any, string, any>(supabaseUrl, serviceRoleKey, {
    db: { schema },
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js fetch 캐시 우회 — 항상 최신 데이터 조회 (캐시된 빈 결과 방지)
      fetch: (url, options = {}) =>
        fetch(url, { ...options, cache: "no-store" }),
    },
  });
}
