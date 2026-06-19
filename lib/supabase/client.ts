"use client";

import { createClient } from "@supabase/supabase-js";

// 브라우저용 클라이언트 — anon 키 사용 (조회 전용 권한).
// 쓰기 작업은 모두 서버 API route(service_role)를 통해 수행합니다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
