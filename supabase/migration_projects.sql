-- ============================================================
-- 멀티 프로젝트: 프로젝트 레지스트리 + 프로젝트 스키마 생성/삭제 함수
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 1회 실행하세요. (여러 번 실행해도 안전)
--
-- 구조: B820은 지금처럼 public 스키마를 쓰고, 새 "앨범 프로젝트"는 public을 복제한
--       자기 스키마(예: b900)를 쓴다. 앱은 supabase-js의 db.schema 옵션으로 스키마를 고른다.
--       → B820 운영 데이터는 건드리지 않는다.
--
-- 실행 후 검증:
--   select public.create_project_schema('t1');          -- {"slug":"t1","exposed":true} 기대
--   select * from t1.vehicles; select * from t1.operator_progress;
--   REST: GET {SUPABASE_URL}/rest/v1/vehicles?select=plate&limit=1
--         헤더 apikey/Authorization=service_role, Accept-Profile: t1  → 200 []
--   PGRST106(schema must be one of ...)이면 아래 "노출" 단계가 권한 부족으로 실패한 것:
--     Dashboard > Settings > API > Exposed schemas 에 t1 추가  또는
--     Vercel env SUPABASE_ACCESS_TOKEN(개인 액세스 토큰)·SUPABASE_PROJECT_REF 를 넣으면 앱이 자동 노출.
--   정리: select public.drop_project_schema('t1');
--
-- 주의: 앞으로 B820용 마이그레이션(컬럼 추가 등)은 각 앨범 스키마에도 똑같이 실행해야 한다.
--       (복제는 생성 시점 스냅샷)  예) 각 slug에 대해 `set search_path to <slug>;` 후 같은 SQL 실행.
-- ============================================================

-- ----- 프로젝트 레지스트리 (런처 카드 + 앨범 프로젝트 메타) -----
create table if not exists public.projects (
  slug                text primary key,             -- album: ^[a-z][a-z0-9_]{1,19}$ (= 스키마명). link 카드: 기존 uuid
  kind                text not null check (kind in ('album','link')),
  name                text not null,
  description         text not null default '',
  icon                text not null default 'folder',
  color               text not null default 'blue',
  url                 text,                         -- link 카드 전용 (이동할 주소)
  drive_folder_id     text,                         -- album(비기본) 전용: 구글드라이브 프로젝트 폴더
  admin_password_hash text,                         -- album(비기본) 전용: sha256('<slug>:'+비밀번호) hex (= 관리자 쿠키 토큰값)
  sort                int not null default 0,       -- 작을수록 앞 (b820 = -1)
  created_at          timestamptz not null default now()
);
alter table public.projects enable row level security;   -- 정책 없음 → service_role(서버)만 접근

-- B820 행 (카드 색은 기존 app_settings.b820_card_color 이관, 없으면 blue)
insert into public.projects (slug, kind, name, description, icon, color, sort)
values ('b820', 'album', 'B820 설치 사진첩', '인천버스 단말기 설치', 'bus',
        coalesce((select value from public.app_settings where key = 'b820_card_color'), 'blue'), -1)
on conflict (slug) do nothing;

-- 기존 링크 카드(app_settings.projects JSON) 이관 → kind='link'. (JSON 행은 남겨두되 앱은 더 안 읽음)
insert into public.projects (slug, kind, name, description, icon, color, url, created_at)
select p->>'id', 'link', p->>'name', coalesce(p->>'description', ''),
       coalesce(p->>'icon', 'folder'), coalesce(p->>'color', 'blue'), p->>'url',
       coalesce((p->>'created_at')::timestamptz, now())
from public.app_settings s, jsonb_array_elements(s.value::jsonb) p
where s.key = 'projects' and jsonb_typeof(s.value::jsonb) = 'array'
  and coalesce(p->>'id', '') <> '' and coalesce(p->>'name', '') <> '' and coalesce(p->>'url', '') <> ''
on conflict (slug) do nothing;

-- ----- 프로젝트 스키마 생성 -----
-- public의 테이블 12개(LIKE ... INCLUDING ALL: PK·unique·check·default·identity·인덱스 복사) + FK 4개 +
-- operator_progress 뷰 + RLS + service_role 권한 + PostgREST 노출(pgrst.db_schemas).
create or replace function public.create_project_schema(slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t        text;
  def      text;
  cur      text;
  exposed  boolean := false;
  reserved text[] := array['public','b820','storage','auth','extensions','graphql','graphql_public',
                           'realtime','vault','net','pgsodium','pgsodium_masks','supabase_functions',
                           'supabase_migrations','information_schema','cron','pgbouncer','repack','tiger','topology'];
begin
  if slug !~ '^[a-z][a-z0-9_]{1,19}$' then
    raise exception '프로젝트 ID 형식 오류: % (영문 소문자 시작, 소문자·숫자·_ 2~20자)', slug;
  end if;
  if slug = any (reserved) or slug like 'pg\_%' then
    raise exception '예약된 이름이라 쓸 수 없습니다: %', slug;
  end if;
  if exists (select 1 from pg_namespace where nspname = slug) then
    raise exception '이미 존재하는 프로젝트(스키마)입니다: %', slug;
  end if;

  execute format('create schema %I', slug);

  foreach t in array array['vehicles','records','photos','check_photos','reference_photos',
                           'pledge_sessions','pledge_signatures','consultations','dispatch_times',
                           'modem_defects','vocs','app_settings'] loop
    execute format('create table %I.%I (like public.%I including all)', slug, t, t);
    execute format('alter table %I.%I enable row level security', slug, t);
  end loop;

  -- FK (LIKE는 외래키를 복사하지 않음)
  execute format('alter table %I.records add constraint records_plate_fkey foreign key (plate) references %I.vehicles(plate)', slug, slug);
  execute format('alter table %I.photos add constraint photos_plate_fkey foreign key (plate) references %I.records(plate) on delete cascade', slug, slug);
  execute format('alter table %I.check_photos add constraint check_photos_plate_fkey foreign key (plate) references %I.records(plate) on delete cascade', slug, slug);
  execute format('alter table %I.pledge_signatures add constraint pledge_signatures_session_id_fkey foreign key (session_id) references %I.pledge_sessions(id) on delete cascade', slug, slug);

  -- 뷰: public 정의를 그대로 가져와 새 스키마 테이블을 가리키게 생성
  -- (search_path=public 상태에서 뽑은 정의는 테이블명이 비한정 → 새 스키마를 search_path 앞에 두고 생성)
  def := pg_get_viewdef('public.operator_progress'::regclass, true);
  execute format('set local search_path to %I, public', slug);
  execute format('create view %I.operator_progress as %s', slug, def);
  execute 'set local search_path to public';

  -- 권한: 서버(service_role)만. anon/authenticated 는 주지 않는다.
  execute format('grant usage on schema %I to service_role', slug);
  execute format('grant all on all tables in schema %I to service_role', slug);
  execute format('grant all on all sequences in schema %I to service_role', slug);
  execute format('alter default privileges in schema %I grant all on tables to service_role', slug);
  execute format('alter default privileges in schema %I grant all on sequences to service_role', slug);

  -- PostgREST 노출: authenticator 롤의 pgrst.db_schemas 에 추가 (권한 부족이면 exposed=false 로 알림)
  begin
    select substring(cfg from '^pgrst\.db_schemas=(.*)$') into cur
      from pg_roles r, unnest(r.rolconfig) cfg
     where r.rolname = 'authenticator' and cfg like 'pgrst.db_schemas=%'
     limit 1;
    if cur is null or cur = '' then
      cur := 'public, graphql_public';
    end if;
    if not (slug = any (select trim(x) from unnest(string_to_array(cur, ',')) x)) then
      cur := cur || ', ' || slug;
      execute format('alter role authenticator set pgrst.db_schemas = %L', cur);
    end if;
    notify pgrst, 'reload config';
    exposed := true;
  exception when others then
    exposed := false;
  end;
  notify pgrst, 'reload schema';

  return jsonb_build_object('slug', slug, 'exposed', exposed, 'db_schemas', cur);
end
$$;

-- ----- 프로젝트 스키마 삭제 (검증·정리용. 앱 UI에는 연결하지 않음) -----
create or replace function public.drop_project_schema(slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cur  text;
  rest text;
begin
  if slug !~ '^[a-z][a-z0-9_]{1,19}$' or slug in ('public','b820') or slug like 'pg\_%' then
    raise exception '삭제할 수 없는 이름: %', slug;
  end if;
  execute format('drop schema if exists %I cascade', slug);
  begin
    select substring(cfg from '^pgrst\.db_schemas=(.*)$') into cur
      from pg_roles r, unnest(r.rolconfig) cfg
     where r.rolname = 'authenticator' and cfg like 'pgrst.db_schemas=%'
     limit 1;
    if cur is not null then
      select string_agg(trim(x), ', ') into rest
        from unnest(string_to_array(cur, ',')) x
       where trim(x) <> slug;
      execute format('alter role authenticator set pgrst.db_schemas = %L', coalesce(rest, 'public, graphql_public'));
    end if;
    notify pgrst, 'reload config';
  exception when others then
    null;
  end;
  notify pgrst, 'reload schema';
  delete from public.projects p where p.slug = drop_project_schema.slug;
  return jsonb_build_object('dropped', slug);
end
$$;

-- 함수는 서버(service_role)만 호출. 공개 키(anon)로는 호출 불가.
revoke all on function public.create_project_schema(text) from public, anon, authenticated;
revoke all on function public.drop_project_schema(text)   from public, anon, authenticated;
grant execute on function public.create_project_schema(text) to service_role;
grant execute on function public.drop_project_schema(text)   to service_role;
