import { isAdmin } from "@/lib/admin-auth";
import AdminLogin from "@/components/AdminLogin";
import { getSlotConfig } from "@/lib/settings";
import { getReferenceUrls } from "@/lib/reference";
import ReferenceManager from "@/components/ReferenceManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ReferencePage() {
  if (!(await isAdmin())) return <AdminLogin />;
  const [urls, cfg] = await Promise.all([getReferenceUrls(), getSlotConfig()]);
  return <ReferenceManager initialUrls={urls} check={cfg.check} before={cfg.before} after={cfg.after} />;
}
