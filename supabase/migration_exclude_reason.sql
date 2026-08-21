-- 설치제외 사유 — 금일완료 리포트에서 적은 차량별 제외 사유를 배차표 행에 함께 저장한다.
-- 진행현황 엑셀(진행현황 시트 비고 I:N)이 이 값을 읽어 쓴다.
alter table dispatch_times add column if not exists exclude_reason text;
