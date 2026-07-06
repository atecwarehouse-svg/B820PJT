-- 앱 설정 테이블 — 키/값 저장 (관리자 페이지에서 수정하는 값).
-- 현재 사용: report_mail_to = 완료리포트 메일 기본 수신자 (쉼표 구분).
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

create table if not exists app_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);
