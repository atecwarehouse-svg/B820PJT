-- 배차표 추가 체크 2종 (Supabase SQL Editor에서 실행)
--   tacho_checked: 타코확인 완료 — 조영 DT-202 차량의 '타코확인' 배지를 체크하면 녹색으로 표시
--   excluded: 설치제외 — 나중에 설치할 차량 표시(리스트에는 그대로 남음)
alter table dispatch_times add column if not exists tacho_checked boolean not null default false;
alter table dispatch_times add column if not exists excluded boolean not null default false;
