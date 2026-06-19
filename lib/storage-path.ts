// Supabase Storage 객체 키는 비ASCII(한글 등)를 허용하지 않으므로,
// 차량번호(한글 포함)를 UTF-8 hex로 인코딩해 폴더명으로 사용한다.
// (서버 전용 — Buffer 사용)

export function plateFolder(plate: string): string {
  return Buffer.from(plate, "utf8").toString("hex");
}

export function storageKey(
  plate: string,
  section: string,
  slotKey: string,
): string {
  return `${plateFolder(plate)}/${section}/${slotKey}.jpg`;
}
