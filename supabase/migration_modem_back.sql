-- 모뎀 사용내역: 증차 차량 '모뎀 뒷면' 사진 1칸 추가.
-- 증차는 사진 4장(차량번호 · 모뎀 뒷면 · LTE 설치 · LTE 정보)이라 기존 3칸으로 부족하다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

alter table modem_defects add column if not exists photo_back text;  -- Drive 파일 ID — 모뎀 뒷면(증차)
