-- 협의사항에 '단말기 보관 위치' 항목 추가 (2026-07-25)
-- 미실행이어도 팀즈 전송·기존 항목 저장은 정상 — 이 컬럼 저장만 생략됨.
alter table consultations add column if not exists terminal_storage text;
