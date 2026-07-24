import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import ExcelJS from "exceljs";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { workDateString } from "@/lib/work-day";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/weather → 금일(업무일) 설치 예정 운수사 차고지의 "작업 시간대(20시~익일 12시) 예보".
// 위치 출처: 진행현황 템플릿 차량리스트 E열(야간 박차지 주소) — 동 단위까지 추출,
// 동 좌표는 무료 지오코딩(Open-Meteo)으로 얻고 실패하면 구/군 대표 좌표로 폴백.
// 홈 화면 우측 상단 위젯용.

// 주소에서 구/군 추출 — 표기 편차(남구=미추홀구, 웅진군 오타) 흡수
const GU_RE =
  /(중구|동구|미추홀구|남구|연수구|남동구|부평구|계양구|서구|강화군|옹진군|웅진군|광명시)/;
// 주소에서 동/읍/면 추출 (예: "석남동", "강화읍", "교동면")
const DONG_RE = /([가-힣]{1,6}[동읍면])(?=[\s(),\d]|$)/;

// 구/군 대표 좌표 (구청·군청 기준) — 동 지오코딩 실패 시 폴백
const COORDS: Record<string, { lat: number; lon: number; sido: string }> = {
  중구: { lat: 37.4738, lon: 126.6216, sido: "인천광역시" },
  동구: { lat: 37.4739, lon: 126.6432, sido: "인천광역시" },
  미추홀구: { lat: 37.4638, lon: 126.6503, sido: "인천광역시" },
  연수구: { lat: 37.4106, lon: 126.6788, sido: "인천광역시" },
  남동구: { lat: 37.447, lon: 126.7312, sido: "인천광역시" },
  부평구: { lat: 37.507, lon: 126.7219, sido: "인천광역시" },
  계양구: { lat: 37.5374, lon: 126.7377, sido: "인천광역시" },
  서구: { lat: 37.5456, lon: 126.676, sido: "인천광역시" },
  강화군: { lat: 37.7469, lon: 126.4878, sido: "인천광역시" },
  옹진군: { lat: 37.4466, lon: 126.6366, sido: "인천광역시" },
  광명시: { lat: 37.4786, lon: 126.8646, sido: "경기도" },
};

function parseAddress(addr: string): { gu: string; dong: string | null } | null {
  const m = GU_RE.exec(addr);
  if (!m) return null;
  const gu = m[1] === "남구" ? "미추홀구" : m[1] === "웅진군" ? "옹진군" : m[1];
  if (!COORDS[gu]) return null;
  const dm = DONG_RE.exec(addr);
  // 구/군 명칭 자체가 동 정규식에 걸리는 경우 제외 (예: "중구")
  const dong = dm && !GU_RE.test(dm[1]) ? dm[1] : null;
  return { gu, dong };
}

// 템플릿에서 운수사 → 구/동 맵 (1시간 캐시 — 템플릿은 일정 업로드 때만 바뀜)
const loadOperatorLoc = unstable_cache(
  async (): Promise<Record<string, { gu: string; dong: string | null }>> => {
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
    const map: Record<string, { gu: string; dong: string | null }> = {};
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const op = txt(row.getCell("B").value).trim();
      if (!op || map[op]) continue;
      const loc = parseAddress(txt(row.getCell("E").value).trim());
      if (loc) map[op] = loc;
    }
    return map;
  },
  ["weather-operator-loc"],
  { revalidate: 3600 },
);

// 동 이름 → 좌표 (무료 지오코딩, 시도·구 일치 확인). 실패 시 null → 구 좌표 폴백.
// 동 좌표는 변하지 않으므로 1일 캐시(인자별 키).
const geocodeDong = unstable_cache(
  async (dong: string, gu: string): Promise<{ lat: number; lon: number } | null> => {
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(dong)}&language=ko&count=10`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) return null;
      const json = await res.json();
      const sido = COORDS[gu].sido;
      const hit = ((json.results ?? []) as {
        latitude: number;
        longitude: number;
        admin1?: string;
        admin2?: string;
      }[]).find((r) => r.admin1 === sido && (!r.admin2 || r.admin2 === gu));
      return hit ? { lat: hit.latitude, lon: hit.longitude } : null;
    } catch {
      return null;
    }
  },
  ["weather-geocode"],
  { revalidate: 86400 },
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

// "YYYY-MM-DD" + n일
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export interface WeatherItem {
  label: string; // 예: "서구 석남동"
  icon: string;
  text: string;
  tempMin: number;
  tempMax: number;
  rainProb: number; // 작업 시간대 최대 강수확률(%)
  operators: string[];
}

// 금일 설치 예정 운수사들의 위치별 작업 시간대 예보 (10분 캐시)
const loadWeather = unstable_cache(
  async (date: string): Promise<WeatherItem[]> => {
    const supabase = createServiceClient();
    const vehicles = await fetchAll<{ operator: string | null }>((from, to) =>
      supabase
        .from("vehicles")
        .select("operator, planned_date")
        .eq("planned_date", date)
        .order("plate")
        .range(from, to),
    );
    const operators = [...new Set(vehicles.map((v) => v.operator?.trim()).filter(Boolean))] as string[];
    if (operators.length === 0) return [];

    const opLoc = await loadOperatorLoc();
    // 위치(구+동) → 운수사들 (주소 없는 운수사는 표시 제외)
    const byLoc = new Map<string, { gu: string; dong: string | null; operators: string[] }>();
    for (const op of operators) {
      const loc = opLoc[op];
      if (!loc) continue;
      const key = `${loc.gu}|${loc.dong ?? ""}`;
      const g = byLoc.get(key) ?? { gu: loc.gu, dong: loc.dong, operators: [] };
      g.operators.push(op);
      byLoc.set(key, g);
    }
    if (byLoc.size === 0) return [];

    // 좌표 결정 — 동 지오코딩 우선, 실패 시 구/군 대표 좌표
    const locs = [...byLoc.values()];
    const coords = await Promise.all(
      locs.map(async (l) => {
        const geo = l.dong ? await geocodeDong(l.dong, l.gu) : null;
        return geo ?? { lat: COORDS[l.gu].lat, lon: COORDS[l.gu].lon };
      }),
    );

    // 작업 시간대 = 업무일 20:00 ~ 익일 12:00. 이미 시간이 지난 구간은 제외.
    const windowStart = `${date}T20:00`;
    const windowEnd = `${addDays(date, 1)}T12:00`;
    const kstNow = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 13) + ":00";
    const from = kstNow > windowStart ? kstNow : windowStart;

    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${coords.map((c) => c.lat).join(",")}` +
        `&longitude=${coords.map((c) => c.lon).join(",")}` +
        `&hourly=temperature_2m,precipitation_probability,weather_code` +
        `&forecast_days=3&timezone=Asia%2FSeoul`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) throw new Error(`날씨 조회 실패 (${res.status})`);
    const json = await res.json();
    const list = Array.isArray(json) ? json : [json];

    return locs.map((l, i) => {
      const h = list[i]?.hourly ?? {};
      const times: string[] = h.time ?? [];
      let tMin = Infinity;
      let tMax = -Infinity;
      let prob = 0;
      let code = 0;
      for (let k = 0; k < times.length; k++) {
        if (times[k] < from || times[k] >= windowEnd) continue;
        const t = Number(h.temperature_2m?.[k]);
        if (Number.isFinite(t)) {
          tMin = Math.min(tMin, t);
          tMax = Math.max(tMax, t);
        }
        prob = Math.max(prob, Number(h.precipitation_probability?.[k] ?? 0));
        code = Math.max(code, Number(h.weather_code?.[k] ?? 0));
      }
      const d = describe(code);
      return {
        label: l.dong ? `${l.gu} ${l.dong}` : l.gu,
        icon: d.icon,
        text: d.text,
        tempMin: Number.isFinite(tMin) ? Math.round(tMin) : 0,
        tempMax: Number.isFinite(tMax) ? Math.round(tMax) : 0,
        rainProb: prob,
        operators: l.operators,
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
