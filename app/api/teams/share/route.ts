import { NextRequest, NextResponse } from "next/server";
import { sendProgressCard, sendStartReportCard, inspectorNames } from "@/lib/teams";
import { getStartReport, setSetting, startReportKey } from "@/lib/settings";

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

// GET /api/teams/share?date=YYYY-MM-DD → 해당 업무일에 시작 보고를 마친 운수사 목록
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  const map = isDate(date) ? await getStartReport(date) : {};
  return NextResponse.json({ sentOps: Object.keys(map) });
}

// POST /api/teams/share  → 설치 진행 현황(또는 설치 시작 보고) 카드를 Teams 채널에 전송
export async function POST(req: NextRequest) {
  const b = (await req.json()) as ShareBody;
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
  try {
    if (b.kind === "start") {
      // 담당 검수자는 등록된 이름(TEAMS_INSPECTOR_WEBHOOKS)만 허용 — 오타·쓰레기 값 차단
      const known = new Set(inspectorNames());
      const groups = (Array.isArray(b.groups) ? b.groups : []).slice(0, 50).map((g) => {
        const inspectors = [
          ...new Set(
            (Array.isArray(g?.inspectors) ? g.inspectors : [])
              .map((x) => String(x).trim())
              .filter((x) => known.has(x)),
          ),
        ];
        return {
          operator: (g?.operator ?? "").toString().slice(0, 40),
          route: (g?.route ?? "").toString().slice(0, 40),
          planned: n(g?.planned),
          inspectors,
          manager: inspectors.join(", "), // 카드 표기 — "담당 김준영, 황문환"
        };
      });
      // 다른 기기·다른 사람이 이미 보고한 운수사는 발송 전에 차단 (동시 보고 중복 방지)
      const sentOps = isDate(b.date) ? Object.keys(await getStartReport(b.date)) : [];
      const dup = [...new Set(groups.map((g) => g.operator).filter((op) => sentOps.includes(op)))];
      if (dup.length) {
        return NextResponse.json(
          { error: `이미 보고가 완료된 운수사입니다: ${dup.join(", ")}` },
          { status: 409 },
        );
      }
      await sendStartReportCard({
        label: (b.label ?? "").toString().slice(0, 40),
        todayPlanned: n(b.todayPlanned),
        complete: n(b.complete),
        remain: n(b.remain),
        groups,
        note: (b.note ?? "").toString().slice(0, 500).trim(),
        startTime: (b.startTime ?? "").toString().slice(0, 5),
      });
      if (isDate(b.date)) {
        // 기록 저장 실패는 무시 — 카드는 이미 발송됨 (다음 조회에서 잠금이 빠질 뿐).
        // 팀즈 전송에 수초가 걸리므로 발송 전 값(sentOps)이 아니라 지금 값을 다시 읽어 병합한다.
        // ponytail: read-modify-write. app_settings.value가 text라 원자적 merge 불가.
        //           동시 보고 충돌이 잦아지면 jsonb + || 로.
        try {
          const map = await getStartReport(b.date);
          for (const g of groups) map[g.operator] = g.inspectors;
          await setSetting(startReportKey(b.date), JSON.stringify(map));
        } catch {}
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
