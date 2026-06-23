// 내보내기 파일명용 한국시간 타임스탬프 (YYYYMMDD_HHmm).
// 서버는 UTC라 +9시간 보정 후 UTC 필드를 읽어 KST 구성요소를 얻는다.
export function kstStamp(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `_${p(d.getUTCHours())}${p(d.getUTCMinutes())}`
  );
}
