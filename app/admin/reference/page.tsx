import { isAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { publicPhotoUrl } from "@/lib/photo-url";
import AdminLogin from "@/components/AdminLogin";
import ReferenceManager from "@/components/ReferenceManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ReferencePage() {
  if (!isAdmin()) return <AdminLogin />;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("reference_photos")
    .select("slot_key, storage_path, updated_at");

  const urls: Record<string, string> = {};
  for (const r of data ?? []) {
    if (r.storage_path) {
      urls[r.slot_key] = `${publicPhotoUrl(r.storage_path)}?t=${r.updated_at ?? ""}`;
    }
  }

  return <ReferenceManager initialUrls={urls} />;
}
