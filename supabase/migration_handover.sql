-- ============================================================
-- 양도양수 체크리스트 프로젝트(kind='handover') — Supabase SQL Editor 에 붙여넣고 1회 실행 (여러 번 실행해도 안전)
--
-- 1) public.projects.kind 에 'handover' 허용
-- 2) create_handover_schema(slug): 기존 create_project_schema 로 스키마·RLS·권한·노출을 만든 뒤
--    <slug>.vehicles 에 완료 상태 3컬럼(done_at·done_by·note)을 추가한다.
--    (삭제는 기존 drop_project_schema 그대로 — vehicles 테이블 존재만 확인하므로 handover 스키마도 지운다)
--
-- 실행 후 검증:
--   select public.create_handover_schema('t_ho');    -- {"slug":"t_ho","exposed":true} 기대
--   select column_name from information_schema.columns where table_schema='t_ho' and table_name='vehicles';  -- done_at·done_by·note 포함
--   select public.drop_project_schema('t_ho');
-- ============================================================

alter table public.projects drop constraint if exists projects_kind_check;
alter table public.projects add constraint projects_kind_check check (kind in ('album','link','handover'));

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
    'alter table %I.vehicles add column done_at timestamptz, add column done_by text, add column note text',
    slug
  );
  notify pgrst, 'reload schema';
  return r;
end
$$;

revoke all on function public.create_handover_schema(text) from public, anon, authenticated;
grant execute on function public.create_handover_schema(text) to service_role;
