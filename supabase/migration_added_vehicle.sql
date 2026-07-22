-- records.added_vehicle — 폐차 후 증차차량 표시 (설치 전 사진 없음).
-- 설치 전 단계의 '증차차량' 체크: 설치전 칸을 사진 없이 충족 처리(na_slots에 함께 기록)하고,
-- PDF/엑셀 사진칸 가운데에 '증차차량' 텍스트를 표시하는 데 사용.
-- (Supabase SQL Editor에서 실행)
alter table records add column if not exists added_vehicle boolean not null default false;
