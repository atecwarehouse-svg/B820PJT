-- ============================================================
-- 대시보드 집계 뷰 수정: '단말기 없음'도 표준 14칸만 세기
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 1회 실행하세요.
--
-- 문제: 사진은 표준 슬롯만 세도록 이미 고쳤는데(migration_progress_std_slots.sql),
--       na_slots(단말기 없음)는 jsonb_array_length 로 '전체 길이'를 세고 있었습니다.
--       '증차차량' 체크는 설치전 칸 전체를 na_slots에 넣는데, 여기에 사용자가 추가한
--       커스텀 칸(before_custom_*)도 함께 들어갑니다. 그래서 표준 14칸이 다 안 찼는데도
--       커스텀 칸 개수만큼 부풀려져 '완료'로 집계될 수 있었습니다.
-- 수정: na_slots 중 표준 14칸에 해당하는 것만 셉니다.
--       (완료 기준이 되는 표준 슬롯 목록은 위 마이그레이션과 동일)
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
  select
    r.plate,
    (
      select count(*)
      from jsonb_array_elements_text(r.na_slots) as k(slot)
      where k.slot in (
        'before_plate','before_gps','before_operator','before_terminal',
        'before_board','before_alight1','before_alight2',
        'after_gps','after_terminal','after_lte','after_display',
        'after_board','after_alight1','after_alight2'
      )
    ) as cnt
  from records r
) na on na.plate = v.plate
group by v.operator;
