-- 저장(목록 등록) 상태 컬럼 추가.
-- Supabase 대시보드 > SQL Editor 에서 1회 실행하세요.

alter table records add column if not exists saved_at timestamptz;

-- 목록 정렬/조회용 인덱스
create index if not exists records_saved_at_idx on records (saved_at desc);
