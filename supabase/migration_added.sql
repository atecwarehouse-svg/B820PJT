-- ============================================================
-- 마이그레이션: 증차 차량 지원
-- 마스터 차량리스트에 없던 차량을 앱에서 직접 추가할 때 구분용 플래그.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- ============================================================

alter table vehicles add column if not exists is_added boolean not null default false;
