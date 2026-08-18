-- LTE 모뎀 사용내역(모뎀불량) — 배차표 '모뎀불량' 버튼에서 저장.
-- 사진은 DB에 넣지 않고 Google Drive(LTE모뎀불량/운수사명/차량번호)에 올린 뒤
-- 파일 ID만 보관한다. 같은 차량을 다시 저장하면 기존 파일을 지우고 새로 올린다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
create table if not exists modem_defects (
  id bigint generated always as identity primary key,
  date date not null,              -- 교체일자(= 설치일)
  plate text not null,             -- 차량번호(DB 표기: 인천70바4652)
  operator text not null default '',
  kind text not null,              -- 현장교체 | 증차 | 예비품불량
  symptom text,                    -- 증상(증차는 비어 있음)
  before_sn text,                  -- 교체 전 LTE S/N
  after_sn text,                   -- 교체 후 LTE S/N
  photo_plate text,                -- Drive 파일 ID — 차량번호(작업자 촬영분 복사)
  photo_after text,                -- Drive 파일 ID — LTE 교체 후
  photo_info text,                 -- Drive 파일 ID — LTE 정보
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, plate)
);

create index if not exists modem_defects_date_idx on modem_defects (date);

-- 앱 서버는 service_role로만 접근한다(RLS 우회) — 정책 없이 RLS만 켠다.
alter table modem_defects enable row level security;
