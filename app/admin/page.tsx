import { isAdmin } from "@/lib/admin-auth";
import { currentProject, isChecklist } from "@/lib/project";
import AdminLogin from "@/components/AdminLogin";
import AdminPanel from "@/components/AdminPanel";
import HandoverAdmin from "@/components/handover/HandoverAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const project = await currentProject();
  if (!(await isAdmin())) return <AdminLogin />;
  // 체크리스트형 프로젝트(양도양수·OS업데이트)는 관리 항목이 다르다(차량 업로드·센터 배정·작업자·팀즈 알림·현황)
  return isChecklist(project.kind) ? <HandoverAdmin projectName={project.name} kind={project.kind} /> : <AdminPanel />;
}
