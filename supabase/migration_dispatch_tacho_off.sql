-- 배차표 '타코 미연결' (Supabase SQL Editor에서 실행)
--   tacho_reason: 타코가 연결되지 않은 사유. 값이 있으면 = 미연결, 비어 있으면 = 정상.
--   불리언을 따로 두지 않는 이유: '미연결인데 사유가 없는' 모순 상태를 아예 못 만들기 위해.
alter table dispatch_times add column if not exists tacho_reason text;

-- 기존 tacho_checked(타코확인 완료) 컬럼은 더 이상 쓰지 않는다.
-- 지우면 롤백이 불가능하므로 남겨 두고, 코드에서만 참조를 끊었다.
-- 한동안 문제가 없으면 아래를 실행해 정리해도 된다:
--   alter table dispatch_times drop column if exists tacho_checked;
