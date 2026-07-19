-- 배차표(차량별 나가는 시간) 저장 테이블
-- 홈 화면 '배차표' 팝업에서 저장 시 upsert(설치일+차량번호 기준).
-- 모든 기기에서 같은 배차표를 조회·수정한다(팀즈 전송 없음).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
create table if not exists dispatch_times (
  id bigint generated always as identity primary key,
  operator text not null,          -- 운수사
  date date not null,              -- 설치 예정일
  route text,                      -- 노선(표시용)
  plate text not null,             -- 차량번호
  out_time text,                   -- 나가는 시간 "HH:MM" (미정이면 null)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, plate)
);

alter table dispatch_times enable row level security;
