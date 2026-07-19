-- 배차표 체크리스트 작성 여부 컬럼 추가
-- 미실행이어도 배차표는 동작(체크리스트 체크만 저장되지 않음 — API가 자동 폴백).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
alter table dispatch_times
  add column if not exists checklist boolean not null default false;
