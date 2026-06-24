import { isAdmin } from "@/lib/admin-auth";
import AdminLogin from "@/components/AdminLogin";
import AdminPanel from "@/components/AdminPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AdminPage() {
  if (!isAdmin()) return <AdminLogin />;
  return <AdminPanel />;
}
