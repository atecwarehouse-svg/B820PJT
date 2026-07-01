-- ============================================================
-- B820 설치 사진첩 — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- ============================================================

-- ----- 차량 마스터 (CSV에서 적재) -----
create table if not exists vehicles (
  plate        text primary key,     -- 차량번호 (예: 인천70바4005)
  operator     text not null,        -- 운수사
  route        text not null,        -- 노선
  planned_date date,                 -- 설치 예정일 (차량리스트 I열, 일정 시각화용)
  is_pilot     boolean not null default false, -- 시범설치 여부
  is_added     boolean not null default false, -- 증차(마스터에 없던 차량을 앱에서 추가)
  year         text,                 -- 연식 마스터 (차량리스트 J열, 입력 기본값)
  model        text                  -- 모델명 마스터 (차량리스트 L열, 입력 기본값)
);

-- 기존 DB 대비 컬럼 보강 (이미 vehicles가 있는 경우)
alter table vehicles add column if not exists planned_date date;
alter table vehicles add column if not exists is_pilot boolean not null default false;
alter table vehicles add column if not exists is_added boolean not null default false;
alter table vehicles add column if not exists year text;
alter table vehicles add column if not exists model text;

-- 차량번호 앞부분 검색(autocomplete)용 인덱스
create index if not exists vehicles_plate_prefix
  on vehicles (plate text_pattern_ops);

-- ----- 사진첩 레코드 (차량 1대 = 1행) -----
create table if not exists records (
  plate        text primary key references vehicles(plate),
  install_date date not null default current_date,  -- 설치일자(자동: 최초 생성일)
  operator     text,                                -- 운수사 스냅샷
  route        text,                                -- 노선 스냅샷
  year         text,                                -- 연식 (수동 입력)
  model        text,                                -- 차종 (수동 입력)
  team         text,                                -- 설치 팀명 (저장 시 필수 입력)
  custom_slots jsonb not null default '[]'::jsonb,  -- 동적 추가 항목 [{slot_key,label,sort_order}]
  na_slots     jsonb not null default '[]'::jsonb,  -- 단말기 없음 표시 슬롯키 목록(하차 등) → 사진없이 충족
  start_notified_at    timestamptz,                 -- 팀즈 '설치 시작' 발송 시각(중복방지)
  complete_notified_at timestamptz,                 -- 팀즈 '설치 완료' 발송 시각(중복방지)
  saved_at     timestamptz,                         -- '저장' 버튼으로 목록 등록된 시각 (null=미저장)
  updated_at   timestamptz not null default now()
);

alter table records add column if not exists team text;

create index if not exists records_saved_at_idx on records (saved_at desc);

-- ----- 사진 -----
create table if not exists photos (
  id           uuid primary key default gen_random_uuid(),
  plate        text not null references records(plate) on delete cascade,
  section      text not null check (section in ('before','after')),
  slot_key     text not null,
  label        text not null,
  storage_path text not null,        -- Google Drive 파일 ID
  sort_order   int  not null,
  is_custom    boolean not null default false,
  updated_at   timestamptz not null default now(),
  unique (plate, slot_key)           -- 슬롯당 1장 (재촬영 시 덮어쓰기)
);

create index if not exists photos_plate_idx on photos (plate);

-- ----- 기준(양식) 사진 — 슬롯별 올바른 예시 1장 (Gemini 비교용) -----
create table if not exists reference_photos (
  slot_key     text primary key,   -- 슬롯 키 (lib/slots.ts)
  section      text,               -- before | after
  label        text,               -- 칸 라벨
  storage_path text not null,      -- Google Drive 파일 ID
  updated_at   timestamptz not null default now()
);

-- ----- 안전관리 서약서 세션 (안전관리자가 1회 생성 = 공유 링크 1개) -----
create table if not exists pledge_sessions (
  id            uuid primary key default gen_random_uuid(),
  manager_name  text not null,                 -- 안전관리 담당자 이름
  operator      text,                          -- 운수사명
  location      text,                          -- 장소
  install_date  date not null default current_date,
  work_content  text not null default '인천버스 교통카드단말기 구축사업 시범설치',
  quantity      text,                          -- 수량(예: 00대) — 선택
  start_time    text,                          -- 설치 시작시간 — 선택
  end_time      text,                          -- 설치 종료시간 — '설치 종료' 시 자동 기록
  ended_at      timestamptz,                   -- 안전관리자가 '설치 종료' 누른 시각(null=진행중). 설치 후 서명 개방 조건
  drive_file_id text,                           -- 최근 생성된 서약서 PDF의 구글드라이브 파일 ID(교체/삭제용)
  created_at    timestamptz not null default now()
);

alter table pledge_sessions add column if not exists ended_at timestamptz;
alter table pledge_sessions add column if not exists drive_file_id text;

create index if not exists pledge_sessions_created_idx on pledge_sessions (created_at desc);

-- ----- 작업자 서명 (세션당 여러 행, 입력 순서 = id 오름차순) -----
create table if not exists pledge_signatures (
  id           bigint generated always as identity primary key,
  session_id   uuid not null references pledge_sessions(id) on delete cascade,
  worker_name  text not null,
  sig_before   text,          -- 설치 전 서명 PNG data URL
  sig_after    text,          -- 설치 후 서명 PNG data URL
  before_at    timestamptz,
  after_at     timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists pledge_sig_session_idx on pledge_signatures (session_id, id);

-- ============================================================
-- RLS (Row Level Security)
-- 인증이 없으므로: 클라이언트(anon)는 vehicles SELECT만 가능.
-- records/photos 쓰기는 서버 API route에서 service_role 키로 수행
-- (service_role은 RLS를 우회하므로 별도 정책 불필요).
-- ============================================================
alter table vehicles enable row level security;
alter table records  enable row level security;
alter table photos   enable row level security;

-- vehicles: 누구나 조회 가능 (autocomplete/lookup)
drop policy if exists "vehicles_anon_select" on vehicles;
create policy "vehicles_anon_select" on vehicles
  for select using (true);

-- records/photos: anon 조회 허용(완성 사진첩 보기). 쓰기 정책 없음 → anon은 쓰기 불가.
drop policy if exists "records_anon_select" on records;
create policy "records_anon_select" on records
  for select using (true);

drop policy if exists "photos_anon_select" on photos;
create policy "photos_anon_select" on photos
  for select using (true);

-- 안전관리 서약서: 공유 링크 페이지에서 anon 조회 허용(세션/서명자 목록 표시).
-- 쓰기는 서버 API route(service_role)로만 수행 → 쓰기 정책 없음.
alter table pledge_sessions   enable row level security;
alter table pledge_signatures enable row level security;

drop policy if exists "pledge_sessions_anon_select" on pledge_sessions;
create policy "pledge_sessions_anon_select" on pledge_sessions
  for select using (true);

drop policy if exists "pledge_signatures_anon_select" on pledge_signatures;
create policy "pledge_signatures_anon_select" on pledge_signatures
  for select using (true);

-- ============================================================
-- 사진 파일 저장소
-- 사진 파일은 Supabase Storage가 아닌 Cloudflare R2에 저장합니다.
-- (이 DB에는 사진 메타데이터(photos 테이블)만 보관)
-- R2 설정은 .env / README 참고.
-- ============================================================
