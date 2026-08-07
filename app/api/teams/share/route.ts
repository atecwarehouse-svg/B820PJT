import { NextRequest, NextResponse } from "next/server";
import { sendProgressCard, sendStartReportCard, inspectorNames } from "@/lib/teams";
import {
  getStartReport,
  getStartReportForUpdate,
  setSetting,
  startReportKey,
} from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ShareBody {
  kind?: string; // "start" = 설치 시작 보고 카드, 그 외 = 진행 현황 카드
  label?: string;
  todayPlanned?: number;
  todayDone?: number; // 금일 완료 (진행 현황 카드)
  complete?: number;
  inProgress?: number;
  remain?: number;
  // 설치 시작 보고용 — 금일 계획의 운수사·노선별 대수 (inspectors = 담당 검수자)
  groups?: { operator?: string; route?: string; planned?: number; inspectors?: string[] }[];
  note?: string; // 설치 시작 보고용 특이사항
  startTime?: string; // 설치 시작 보고용 시작시간 (HH:MM)
  date?: string; // 설치 시작 보고용 업무일(YYYY-MM-DD) — 운수사별 보고 완료 기록 키
}

// 설치 시작 보고 완료 운수사·담당 검수자 (app_settings) — 여러 기기·여러 사람이 공유
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// 담당 검수자 정리 — 등록된 이름(TEAMS_INSPECTOR_WEBHOOKS)만 허용해 오타·쓰레기 값 차단
function cleanInspectors(v: unknown): string[] {
  const known = new Set(inspectorNames());
  return [
    ...new Set(
      (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter((x) => known.has(x)),
    ),
  ];
}

// GET /api/teams/share?date=YYYY-MM-DD → 시작 보고를 마친 운수사 목록 + 운수사별 담당 검수자
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  const map = isDate(date) ? await getStartReport(date) : {};
  return NextResponse.json({ sentOps: Object.keys(map), assignments: map });
}

// PATCH /api/teams/share — 이미 보고한 운수사의 담당 검수자만 수정.
// 팀즈 카드는 보내지 않는다(보고 중복 발송 방지). 보고 잠금도 그대로 유지된다.
export async function PATCH(req: NextRequest) {
  let b: { date?: string; operator?: string; inspectors?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!isDate(b.date)) {
    return NextResponse.json({ error: "날짜를 확인하세요." }, { status: 400 });
  }
  const operator = String(b.operator ?? "").trim();
  const inspectors = cleanInspectors(b.inspectors);

  try {
    const map = await getStartReportForUpdate(b.date);
    if (!Object.hasOwn(map, operator)) {
      // 보고 전 운수사는 보고할 때 함께 저장되므로 여기서 새로 만들지 않는다
      return NextResponse.json({ error: "아직 보고되지 않은 운수사입니다." }, { status: 400 });
    }
    map[operator] = inspectors;
    await setSetting(startReportKey(b.date), JSON.stringify(map));
    return NextResponse.json({ ok: true, inspectors });
  } catch (e) {
    return NextResponse.json(
      { error: "담당 저장 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }
}

// POST /api/teams/share  → 설치 진행 현황(또는 설치 시작 보고) 카드를 Teams 채널에 전송
export async function POST(req: NextRequest) {
  let b: ShareBody;
  try {
    b = (await req.json()) as ShareBody;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
  try {
    if (b.kind === "start") {
      const groups = (Array.isArray(b.groups) ? b.groups : []).slice(0, 50).map((g) => {
        const inspectors = cleanInspectors(g?.inspectors);
        return {
          operator: (g?.operator ?? "").toString().slice(0, 40),
          route: (g?.route ?? "").toString().slice(0, 40),
          planned: n(g?.planned),
          inspectors,
          manager: inspectors.join(", "), // 카드 표기 — "담당 김준영, 황문환"
        };
      });
      // 보고 잠금을 카드 발송 "전"에 먼저 기록한다(선점). 발송에 수초가 걸리는데 그 사이
      // 화면을 닫았다 다시 열거나 다른 기기에서 같은 운수사를 보고하면, 잠금이 아직 없어
      // 같은 카드가 두 번 나가기 때문. 발송이 실패하면 아래에서 선점을 되돌린다.
      // ponytail: read-modify-write. app_settings.value가 text라 원자적 merge 불가 —
      //           선점 덕에 창이 수초→수십ms로 줄었다. 더 줄이려면 jsonb + || 로.
      const date = isDate(b.date) ? b.date : null;
      if (date) {
        const map = await getStartReportForUpdate(date);
        const dup = [
          ...new Set(groups.map((g) => g.operator).filter((op) => Object.hasOwn(map, op))),
        ];
        if (dup.length) {
          return NextResponse.json(
            { error: `이미 보고가 완료된 운수사입니다: ${dup.join(", ")}` },
            { status: 409 },
          );
        }
        for (const g of groups) map[g.operator] = g.inspectors;
        await setSetting(startReportKey(date), JSON.stringify(map));
      }
      try {
        await sendStartReportCard({
          label: (b.label ?? "").toString().slice(0, 40),
          todayPlanned: n(b.todayPlanned),
          complete: n(b.complete),
          remain: n(b.remain),
          groups,
          note: (b.note ?? "").toString().slice(0, 500).trim(),
          startTime: (b.startTime ?? "").toString().slice(0, 5),
        });
      } catch (e) {
        // 카드가 안 나갔으므로 선점을 풀어 다시 보고할 수 있게 한다
        if (date) {
          try {
            const cur = await getStartReportForUpdate(date);
            for (const g of groups) delete cur[g.operator];
            await setSetting(startReportKey(date), JSON.stringify(cur));
          } catch {}
        }
        throw e;
      }
    } else {
      await sendProgressCard({
        label: (b.label ?? "").toString().slice(0, 40),
        todayPlanned: n(b.todayPlanned),
        inProgress: n(b.inProgress),
        todayDone: n(b.todayDone),
        complete: n(b.complete),
        remain: n(b.remain),
      });
    }
  } catch (e) {
    return NextResponse.json(
      { error: "팀즈 전송 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
