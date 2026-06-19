import { loadPrintData } from "@/lib/export/load-record";
import { buildPrintBodyHtml, PRINT_CSS } from "@/lib/export/print-html";
import PrintTrigger from "@/components/PrintTrigger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 화면 인쇄용(브라우저 "PDF로 저장" 폴백). 서버 자동 PDF와 동일 마크업 공유.
export default async function PrintPage({
  params,
}: {
  params: { plate: string };
}) {
  const plate = decodeURIComponent(params.plate).trim();
  const data = await loadPrintData(plate);

  if (!data) {
    return <main style={{ padding: 40 }}>차량을 찾을 수 없습니다: {plate}</main>;
  }

  return (
    <>
      <PrintTrigger />
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div dangerouslySetInnerHTML={{ __html: buildPrintBodyHtml(data) }} />
    </>
  );
}
