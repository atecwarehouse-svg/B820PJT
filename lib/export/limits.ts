// 일괄 내보내기 분할/제한 — 서버 메모리·시간(60초) 초과 예방.
export const EXPORT_CHUNK = 30; // 프론트엔드: 이 단위로 나눠 순차 요청 → 파일 분할
export const EXPORT_MAX = 50; // 서버: 1요청 최대 차량 수 (방어선)
