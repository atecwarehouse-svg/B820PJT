-- 기준(양식) 사진 테이블 — 슬롯별 올바른 예시 사진 1장.
-- 사진 업로드 시 Gemini가 이 기준사진과 비교해 다른 대상/잘못된 칸이면 차단.
-- storage_path = Google Drive 파일 ID (사진과 동일 방식).
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

create table if not exists reference_photos (
  slot_key     text primary key,   -- 슬롯 키 (before_gps 등, lib/slots.ts)
  section      text,               -- before | after
  label        text,               -- 칸 라벨 (표시용)
  storage_path text not null,      -- Drive 파일 ID
  updated_at   timestamptz not null default now()
);
