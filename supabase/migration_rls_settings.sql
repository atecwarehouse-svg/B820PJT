-- ============================================================
-- app_settings · reference_photos RLS 적용
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 1회 실행하세요.
--
-- 문제(2026-08-13 실측): 이 두 테이블만 RLS가 꺼져 있어 공개 anon 키로
--   - app_settings 를 읽고 쓸 수 있었습니다. (리포트 메일 수신자, 설치시작
--     보고 기록·담당 검수자, 설치팀 목록, 검수항목이 여기 저장됩니다)
--   - reference_photos 를 읽고 쓸 수 있었습니다.
--   anon 키는 브라우저 번들에 들어 있어 사실상 공개값입니다.
--   나머지 테이블(vehicles·records·photos·check_photos·dispatch_times·
--   vocs·consultations·pledge_*)은 이미 RLS가 걸려 있습니다.
--
-- 조치: RLS만 켜고 정책은 만들지 않습니다.
--   앱 서버는 전부 service_role 키(createServiceClient)로 접근하고,
--   service_role 은 RLS를 우회하므로 동작에 영향이 없습니다.
--   브라우저 anon 클라이언트(lib/supabase/client.ts)는 현재 어디서도
--   쓰지 않으므로 읽기 정책도 필요 없습니다.
--
-- 실행 후 확인: anon 키로 select 하면 0행, insert 하면 42501 오류가 나면 정상.
-- ============================================================

alter table app_settings     enable row level security;
alter table reference_photos enable row level security;
