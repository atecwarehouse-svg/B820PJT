import { isAdmin } from "@/lib/admin-auth";
import { currentProject } from "@/lib/project";
import AdminLogin from "@/components/AdminLogin";
import AdminPanel from "@/components/AdminPanel";
import HandoverAdmin from "@/components/handover/HandoverAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const project = await currentProject();
  if (!(await isAdmin())) return <AdminLogin />;
  // 양도양수 체크리스트 프로젝트는 관리 항목이 다르다(차량 업로드·센터 배정·작업자·현황)
  return project.kind === "handover" ? <HandoverAdmin projectName={project.name} /> : <AdminPanel />;
}
