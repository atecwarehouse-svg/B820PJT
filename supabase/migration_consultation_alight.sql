-- 협의사항 14번에 '하차 단말기 방향' 항목 추가 (2026-08-24)
-- 미실행이어도 팀즈 전송·기존 항목 저장은 정상 — 이 컬럼 저장만 생략됨.
alter table consultations add column if not exists mount_alight text;
