-- vehicles.tacho — 진행현황 엑셀 차량리스트 U열(타코 제조사).
-- 일정 업로드 시 함께 반영되며, 배차표에서 '조영 DT-202' 차량에
-- 타코확인 표시를 하는 데 사용. (Supabase SQL Editor에서 실행)
alter table vehicles add column if not exists tacho text;
