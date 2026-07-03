-- vehicles.list_no: 진행현황 차량리스트 A열 '번호'
-- 일정변경 업로드 시 적재하고, 진행현황 다운로드 때 A열에 그대로 기록한다.
alter table vehicles add column if not exists list_no integer;
