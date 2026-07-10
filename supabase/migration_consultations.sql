-- 운수사 협의사항 저장 테이블
-- 협의사항 폼 '팀즈로 보내기' 성공 시 upsert(운수사+설치일 기준, 재전송하면 최신 내용으로 갱신).
-- 관리자 페이지에서 조회·삭제, 설치계획 보고에서 설치장소/휴차 자동 불러오기에 사용.
create table if not exists consultations (
  id bigint generated always as identity primary key,
  operator text not null,          -- 운수사
  date date not null,              -- 설치 일정
  count int default 0,             -- 설치 대수(전송 시점 기준)
  routes text,                     -- 노선별 대수 (예: "568 3대")
  list_check text,                 -- 차량리스트·수량 확인 (이상 없음/변동 있음)
  list_change text,                -- 변동사항
  place text,                      -- 설치 장소
  work_start text,                 -- 작업 시간(첫차 운행 종료) "HH:MM"
  day_off text,                    -- 당일 휴차
  next_day_off text,               -- 익일 휴차
  arrival text,                    -- 첫차 종료 후 도착 예정 "HH:MM"
  next_first_bus text,             -- 익일 첫차 출발 "HH:MM"
  depot_out text,                  -- 차고지 출발(첫차 기준) "HH:MM"
  key_method text,                 -- 차키 협조
  engine_on text,                  -- 작업 중 시동 가능 여부
  fuel text,                       -- 충전 여부
  manager_day text,                -- 담당자(주간)
  manager_night text,              -- 담당자(야간)
  mount_display text,              -- 표출기 위치
  mount_main text,                 -- 통합단말기 위치
  mount_board text,                -- 승차 단말기 위치
  handle_removal text,             -- 격벽 손잡이(얇은봉) 탈거 유무
  notes text,                      -- 특이사항
  consulter text,                  -- 협의자
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operator, date)
);

alter table consultations enable row level security;
