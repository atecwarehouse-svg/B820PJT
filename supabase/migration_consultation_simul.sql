-- 협의사항에 '동시출발 여부'·'사전출발 차량번호' 항목 추가 (2026-08-09)
-- 미실행이어도 팀즈 전송·기존 항목 저장은 정상 — 이 두 컬럼 저장만 생략됨.
alter table consultations add column if not exists simul_start text;
alter table consultations add column if not exists early_plates text;
