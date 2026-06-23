// Drive 파일 ID(photos.storage_path) → 앱 프록시 표시 URL.
// 실제 바이트는 /api/photo/[id] 가 Drive에서 받아 스트리밍한다(공개 링크 불필요).
// 클라이언트/서버 양쪽에서 호출되므로 단순 문자열만 생성한다.
export function publicPhotoUrl(fileId: string): string {
  return `/api/photo/${encodeURIComponent(fileId)}`;
}
