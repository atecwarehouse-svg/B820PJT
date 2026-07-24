import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import ExcelJS from "exceljs";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { workDateString } from "@/lib/work-day";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/weather → 금일(업무일) 설치 예정 운수사들의 차고지(구/군) 날씨.
// 위치 출처: 진행현황 템플릿 차량리스트 E열(야간 박차지 주소) — 운수사별 첫 행.
// 날씨: Open-Meteo(무료·키 없음). 홈 화면 우측 상단 위젯용.

// 주소 문자열에서 구/군 추출 — 표기 편차(남구=미추홀구, 웅진군 오타) 흡수
const GU_RE =
  /(중구|동구|미추홀구|남구|연수구|남동구|부평구|계양구|서구|강화군|옹진군|웅진군|광명시)/;

// 구/군 대표 좌표 (구청·군청 기준)
const COORDS: Record<string, { lat: number; lon: number; label: string }> = {
  중구: { lat: 37.4738, lon: 126.6216, label: "인천 중구" },
  동구: { lat: 37.4739, lon: 126.6432, label: "인천 동구" },
  미추홀구: { lat: 37.4638, lon: 126.6503, label: "인천 미추홀구" },
  연수구: { lat: 37.4106, lon: 126.6788, label: "인천 연수구" },
  남동구: { lat: 37.447, lon: 126.7312, label: "인천 남동구" },
  부평구: { lat: 37.507, lon: 126.7219, label: "인천 부평구" },
  계양구: { lat: 37.5374, lon: 126.7377, label: "인천 계양구" },
  서구: { lat: 37.5456, lon: 126.676, label: "인천 서구" },
  강화군: { lat: 37.7469, lon: 126.4878, label: "인천 강화군" },
  옹진군: { lat: 37.4466, lon: 126.6366, label: "인천 옹진군" },
  광명시: { lat: 37.4786, lon: 126.8646, label: "광명시" },
};

function guFromAddress(addr: string): string | null {
  const m = GU_RE.exec(addr);
  if (!m) return null;
  const gu = m[1] === "남구" ? "미추홀구" : m[1] === "웅진군" ? "옹진군" : m[1];
  return COORDS[gu] ? gu : null;
}

// 템플릿에서 운수사 → 구/군 맵 (1시간 캐시 — 템플릿은 일정 업로드 때만 바뀜)
const loadOperatorGu = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const supabase = createServiceClient();
    const bucket = process.env.TEMPLATE_BUCKET ?? "templates";
    const object = process.env.TEMPLATE_OBJECT ?? "progress-template.xlsx";
    const { data, error } = await supabase.storage.from(bucket).download(object);
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
      const gu = guFromAddress(txt(row.getCell("E").value).trim());
      if (gu) map[op] = gu;
    }
    return map;
  },
  ["weather-operator-gu"],
  { revalidate: 3600 },
);

// WMO weather code → 이모지·설명
function describe(code: number): { icon: string; text: string } {
  if (code === 0) return { icon: "☀️", text: "맑음" };
  if (code <= 2) return { icon: "🌤️", text: "구름 조금" };
  if (code === 3) return { icon: "☁️", text: "흐림" };
  if (code === 45 || code === 48) return { icon: "🌫️", text: "안개" };
  if (code <= 57) return { icon: "🌦️", text: "이슬비" };
  if (code <= 67) return { icon: "🌧️", text: "비" };
  if (code <= 77) return { icon: "🌨️", text: "눈" };
  if (code <= 82) return { icon: "🌧️", text: "소나기" };
  if (code <= 86) return { icon: "🌨️", text: "눈" };
  return { icon: "⛈️", text: "뇌우" };
}

// 금일 설치 예정 운수사들의 구별 날씨 (10분 캐시)
const loadWeather = unstable_cache(
  async (
    date: string,
  ): Promise<{ label: string; icon: string; text: string; temp: number; operators: string[] }[]> => {
    const supabase = createServiceClient();
    const vehicles = await fetchAll<{ operator: string | null; planned_date: string | null }>(
      (from, to) =>
        supabase
          .from("vehicles")
          .select("operator, planned_date")
          .eq("planned_date", date)
          .order("plate")
          .range(from, to),
    );
    const operators = [...new Set(vehicles.map((v) => v.operator?.trim()).filter(Boolean))] as string[];
    if (operators.length === 0) return [];

    const opGu = await loadOperatorGu();
    // 구 → 운수사들 (주소 없는 운수사는 표시 제외)
    const byGu = new Map<string, string[]>();
    for (const op of operators) {
      const gu = opGu[op];
      if (!gu) continue;
      byGu.set(gu, [...(byGu.get(gu) ?? []), op]);
    }
    if (byGu.size === 0) return [];

    const gus = [...byGu.keys()];
    const lat = gus.map((g) => COORDS[g].lat).join(",");
    const lon = gus.map((g) => COORDS[g].lon).join(",");
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,weather_code&timezone=Asia%2FSeoul`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) throw new Error(`날씨 조회 실패 (${res.status})`);
    const json = await res.json();
    // 좌표 1곳이면 객체, 여러 곳이면 배열로 온다
    const list = Array.isArray(json) ? json : [json];
    return gus.map((gu, i) => {
      const cur = list[i]?.current ?? {};
      const d = describe(Number(cur.weather_code ?? 0));
      return {
        label: COORDS[gu].label,
        icon: d.icon,
        text: d.text,
        temp: Math.round(Number(cur.temperature_2m ?? 0)),
        operators: byGu.get(gu) ?? [],
      };
    });
  },
  ["weather-today"],
  { revalidate: 600 },
);

export async function GET() {
  try {
    const today = workDateString(new Date());
    const list = await loadWeather(today);
    return NextResponse.json({ date: today, list });
  } catch {
    // 날씨는 부가 정보 — 실패 시 위젯만 숨긴다
    return NextResponse.json({ date: "", list: [] });
  }
}
