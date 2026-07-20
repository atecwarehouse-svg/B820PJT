-- 운수사 VOC 저장 테이블
-- VOC 폼 저장 시 upsert(운수사+설치일 기준, 다시 저장하면 최신 내용으로 갱신).
-- 협의사항(consultations)과 같은 구조·운영 방식이며, 관리자 페이지에서 조회·수정·삭제한다.
create table if not exists vocs (
  id bigint generated always as identity primary key,
  operator text not null,          -- 운수사
  date date not null,              -- 설치 일정(완료 업무일)
  items jsonb not null default '[]'::jsonb,   -- 차량별 VOC [{plate, route, voc}]
  day_off jsonb not null default '[]'::jsonb, -- 금일 휴차 차량번호 배열
  notes text,                      -- 특이사항
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operator, date)
);

alter table vocs enable row level security;
