// 운수사 → 설치 장소 주소(야간 박차지) (진행현황 템플릿 차량리스트 E열, 운수사별 첫 행).
// 날씨 위젯(구/동 추출)과 일정 달력 팝업(주소 표시)이 공유. 1시간 캐시.
// 프로젝트(slug)가 캐시 키 인자에 포함되므로 프로젝트별로 따로 캐시된다.

import { unstable_cache } from "next/cache";
import ExcelJS from "exceljs";
import { createServiceClient } from "@/lib/supabase/server";
import { TEMPLATE_BUCKET, templateObject } from "@/lib/template-path";

export const loadOperatorAddresses = unstable_cache(
  async (slug: string): Promise<Record<string, string>> => {
    const supabase = createServiceClient(slug);
    const { data, error } = await supabase.storage
      .from(TEMPLATE_BUCKET)
      .download(templateObject(slug));
    if (error || !data) return {};
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await data.arrayBuffer()) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("차량리스트");
    if (!ws) return {};
    const txt = (v: unknown): string => {
      if (v == null) return "";
      if (typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (Array.isArray(o.richText)) {
          return (o.richText as { text: string }[]).map((t) => t.text).join("");
        }
        if ("text" in o) return String(o.text);
        if ("result" in o) return String(o.result);
      }
      return String(v);
    };
    const map: Record<string, string> = {};
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const op = txt(row.getCell("B").value).trim();
      if (!op || map[op]) continue;
      const addr = txt(row.getCell("E").value).trim();
      if (addr) map[op] = addr;
    }
    return map;
  },
  ["operator-addresses"],
  { revalidate: 3600 },
);
