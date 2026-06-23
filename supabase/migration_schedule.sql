-- ============================================================
-- 마이그레이션: 설치 일정 시각화용 컬럼 추가
-- vehicles에 설치 예정일(planned_date)·시범설치 여부(is_pilot) 추가.
-- 값은 `npm run import:schedule` 로 양식(차량리스트 I열 + 진행현황 비고)에서 적재.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- ============================================================

alter table vehicles add column if not exists planned_date date;
alter table vehicles add column if not exists is_pilot boolean not null default false;
