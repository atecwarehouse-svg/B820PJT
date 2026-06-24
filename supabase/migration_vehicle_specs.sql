-- 차량 마스터에 연식(year)·모델명(model) 컬럼 추가.
-- 진행현황 양식 차량리스트 시트의 J열(연식)·L열(모델명)을 적재해
-- 사진 입력 화면에서 연식/차종 기본값으로 자동 채우기 위함.
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- 실행 후 진행현황 양식을 업로드(또는 npm run import:schedule)하면 값이 채워집니다.

alter table vehicles add column if not exists year text;
alter table vehicles add column if not exists model text;
