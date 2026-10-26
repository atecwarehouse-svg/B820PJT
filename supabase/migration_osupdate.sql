-- ============================================================
-- 단말기 OS업데이트 적용차량 프로젝트(kind='osupdate') — Supabase SQL Editor 에 붙여넣고 실행 (여러 번 실행해도 안전)
--   ※ 10/26 2판: vehicles.center(차량별 센터 — 전체센터_차량.xlsx A열) 추가. 1판을 이미 실행했어도 이 파일을 다시 실행하면 된다.
--
-- 양도양수 체크리스트(handover)와 같은 구조(create_handover_schema)를 그대로 쓰고,
-- 시내버스/마을버스 구분용 vehicles.bus_type 과 차량별 센터 vehicles.center 두 컬럼만 더한다(기종 원문은 기존 vehicles.model 열).
--   (한 운수사가 두 센터에 걸치는 경우가 있어 영업소→센터 맵(handover_centers)만으로는 부족 → 차량 행에 센터를 둔다)
--
-- 1) public.projects.kind 에 'osupdate' 허용
-- 2) create_handover_schema(slug) 재정의: done_at·done_by·note 에 bus_type·center 추가 (handover·osupdate 공용)
-- 3) 이미 만들어진 handover/osupdate 스키마의 vehicles 에도 bus_type·center 추가(없을 때만) — 조회 컬럼을 하나로 쓰기 위해
--
-- 실행 후 검증:
--   select public.create_handover_schema('t_os');
--   select column_name from information_schema.columns where table_schema='t_os' and table_name='vehicles';  -- bus_type·center 포함
--   select public.drop_project_schema('t_os');
-- ============================================================

alter table public.projects drop constraint if exists projects_kind_check;
alter table public.projects add constraint projects_kind_check check (kind in ('album','link','handover','osupdate'));

create or replace function public.create_handover_schema(slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  r := public.create_project_schema(slug);  -- 스키마·테이블 복제·RLS·service_role 권한·PostgREST 노출
  execute format(
    'alter table %I.vehicles add column done_at timestamptz, add column done_by text, add column note text, add column bus_type text, add column center text',
    slug
  );
  notify pgrst, 'reload schema';
  return r;
end
$$;

revoke all on function public.create_handover_schema(text) from public, anon, authenticated;
grant execute on function public.create_handover_schema(text) to service_role;

-- 기존 handover/osupdate 프로젝트 스키마에 bus_type·center 추가(없을 때만)
do $$
declare
  s text;
begin
  for s in select slug from public.projects where kind in ('handover','osupdate') loop
    if exists (select 1 from information_schema.tables where table_schema = s and table_name = 'vehicles') then
      execute format('alter table %I.vehicles add column if not exists bus_type text, add column if not exists center text', s);
    end if;
  end loop;
end
$$;

notify pgrst, 'reload schema';
