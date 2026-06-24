-- 하차 단말기 '없음' 표시 + 팀즈 시작/완료 알림 중복방지 플래그.
--   na_slots: 단말기 없음으로 표시한 슬롯키 목록(예: ["before_alight1","after_alight2"])
--             → 그 칸은 사진 없이도 '충족'으로 간주.
--   start_notified_at / complete_notified_at: 팀즈 시작/완료 카드 발송 시각(중복 발송 방지).
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

alter table records add column if not exists na_slots jsonb not null default '[]'::jsonb;
alter table records add column if not exists start_notified_at timestamptz;
alter table records add column if not exists complete_notified_at timestamptz;
