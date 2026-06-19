// Storage 경로 → 공개 URL (photos 버킷은 public)
export function publicPhotoUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/photos/${storagePath}`;
}
