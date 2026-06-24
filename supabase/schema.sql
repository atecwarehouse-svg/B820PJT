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
  custom_slots jsonb not null default '[]'::jsonb,  -- 동적 추가 항목 [{slot_key,label,sort_order}]
  saved_at     timestamptz,                         -- '저장' 버튼으로 목록 등록된 시각 (null=미저장)
  updated_at   timestamptz not null default now()
);

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

-- ============================================================
-- 사진 파일 저장소
-- 사진 파일은 Supabase Storage가 아닌 Cloudflare R2에 저장합니다.
-- (이 DB에는 사진 메타데이터(photos 테이블)만 보관)
-- R2 설정은 .env / README 참고.
-- ============================================================
