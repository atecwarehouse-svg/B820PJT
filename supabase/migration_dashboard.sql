-- ============================================================
-- 대시보드 집계용 뷰 (운수사별 진행 현황)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 1회 실행하세요.
--
-- 효과: 대시보드가 사진 수만 행을 앱으로 가져오지 않고,
--       운수사별 집계(수십 줄)만 DB에서 받아 빠르게 동작합니다.
--
-- ⚠️ 완료 기준 = 13장 (앱 lib/slots.ts 의 DEFAULT_PHOTO_COUNT 와 동일).
--    기본 칸 수를 바꾸면 아래 13도 함께 수정하세요.
-- ============================================================

create or replace view operator_progress as
select
  v.operator,
  count(*)::int                                                      as total,
  count(*) filter (where coalesce(pc.cnt, 0) >= 13)::int            as complete,
  count(*) filter (where coalesce(pc.cnt, 0) between 1 and 12)::int as in_progress
from vehicles v
left join (
  select plate, count(*) as cnt
  from photos
  group by plate
) pc on pc.plate = v.plate
group by v.operator;
