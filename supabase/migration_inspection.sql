-- ============================================================
-- 차량 이상유무 확인 사진 (작업 시작 전 8종 촬영) — 2026-07-13
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 1회 실행하세요.
--
-- - check_photos: 이상유무 확인 사진 메타데이터 (Drive 파일 ID).
--   기존 photos와 분리 → KPI/완료판정/PDF/엑셀 집계에 영향 없음.
-- - records.check_na_slots: 장비가 없는 항목 '없음' 체크 목록 (사진 없이 충족)
-- - records.check_note: 차량 이상유무 비고
-- - records.extra_note: 설치 특이사항
-- ============================================================

create table if not exists check_photos (
  id           uuid primary key default gen_random_uuid(),
  plate        text not null references records(plate) on delete cascade,
  slot_key     text not null,       -- lib/slots.ts CHECK_SLOTS (check_led 등 8종)
  label        text not null,       -- 칸 라벨 (전광판 등)
  storage_path text not null,       -- Google Drive 파일 ID
  sort_order   int  not null default 0,
  updated_at   timestamptz not null default now(),
  unique (plate, slot_key)          -- 슬롯당 1장 (재촬영 시 덮어쓰기)
);

create index if not exists check_photos_plate_idx on check_photos (plate);

alter table check_photos enable row level security;

drop policy if exists "check_photos_anon_select" on check_photos;
create policy "check_photos_anon_select" on check_photos
  for select using (true);

alter table records add column if not exists check_na_slots jsonb not null default '[]'::jsonb;
alter table records add column if not exists check_note text;
alter table records add column if not exists extra_note text;
