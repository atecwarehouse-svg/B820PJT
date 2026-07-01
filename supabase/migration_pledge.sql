-- ============================================================
-- 안전관리 서약서 테이블 마이그레이션
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- (여러 번 실행해도 안전 — if not exists / drop policy if exists)
-- ============================================================

-- ----- 안전관리 서약서 세션 (안전관리자가 1회 생성 = 공유 링크 1개) -----
create table if not exists pledge_sessions (
  id            uuid primary key default gen_random_uuid(),
  manager_name  text not null,                 -- 안전관리 담당자 이름
  operator      text,                          -- 운수사명
  location      text,                          -- 장소
  install_date  date not null default current_date,
  work_content  text not null default '인천버스 교통카드단말기 구축사업 시범설치',
  quantity      text,                          -- 수량(예: 00대) — 선택
  start_time    text,                          -- 설치시간 — 선택
  end_time      text,                          -- 종료시간 — 선택
  created_at    timestamptz not null default now()
);

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

-- ----- RLS -----
-- 공유 링크 페이지에서 anon 조회 허용(세션/서명자 목록 표시).
-- 쓰기는 서버 API route(service_role)로만 수행 → 쓰기 정책 없음.
alter table pledge_sessions   enable row level security;
alter table pledge_signatures enable row level security;

drop policy if exists "pledge_sessions_anon_select" on pledge_sessions;
create policy "pledge_sessions_anon_select" on pledge_sessions
  for select using (true);

drop policy if exists "pledge_signatures_anon_select" on pledge_signatures;
create policy "pledge_signatures_anon_select" on pledge_signatures
  for select using (true);
