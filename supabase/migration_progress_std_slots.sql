-- ============================================================
-- 대시보드 집계 뷰 수정: 완료 판정에서 커스텀 사진 칸 제외
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 1회 실행하세요.
--
-- 문제: photos 테이블에는 사용자가 추가한 커스텀 칸(before_custom_*)
--       사진도 저장되는데, 기존 뷰는 슬롯 구분 없이 장수만 세서
--       표준 14칸이 안 찼는데도 커스텀 사진으로 채워져 '완료'로
--       잘못 집계될 수 있었습니다.
-- 수정: 표준 슬롯(before_*/after_* 고정 14칸)만 세도록 필터 추가.
--       (check_* 사진은 별도 테이블이라 원래 포함되지 않음)
-- ============================================================

create or replace view operator_progress as
select
  v.operator,
  count(*)::int                                                                   as total,
  count(*) filter (where coalesce(pc.cnt,0) + coalesce(na.cnt,0) >= 14)::int      as complete,
  count(*) filter (where coalesce(pc.cnt,0) + coalesce(na.cnt,0) between 1 and 13)::int as in_progress
from vehicles v
left join (
  select plate, count(*) as cnt
  from photos
  where slot_key in (
    'before_plate','before_gps','before_operator','before_terminal',
    'before_board','before_alight1','before_alight2',
    'after_gps','after_terminal','after_lte','after_display',
    'after_board','after_alight1','after_alight2'
  )
  group by plate
) pc on pc.plate = v.plate
left join (
  select plate, jsonb_array_length(na_slots) as cnt
  from records
) na on na.plate = v.plate
group by v.operator;
