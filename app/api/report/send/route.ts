import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { loadInstallProgress, loadScheduleStats } from "@/lib/stats";
import { buildReport, formatReportText, formatReportHtml } from "@/lib/report";
import type { ServiceCheck } from "@/lib/report";
import { buildProgressXlsx } from "@/lib/export/build-progress-xlsx";
import { getSetting, setSetting, REPORT_MAIL_KEY } from "@/lib/settings";
import { sendCompletionReportCard } from "@/lib/teams";
import { adminPassword, isAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { summarizeVocs, type VocOperatorSummary, type VocRow } from "@/lib/voc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SendBody {
  date?: string; // 업무일 YYYY-MM-DD
  notes?: string;
  to?: string; // 받는사람 (쉼표/세미콜론 구분). 없으면 env 기본값
  planned?: number | null; // 금일 계획 수량 직접 입력값
  pw?: string; // 관리자 비밀번호 (관리자 페이지 로그인 쿠키로 대체 가능)
  check?: ServiceCheck; // 운행시작 점검(승무사원 교육·요금세팅·BIS·카카오)
  stage?: 1 | 2; // 1차=팀즈 알림만, 2차=VOC 추가 + 메일까지 발송 (기본 2)
}

function parseRecipients(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

// 해당 업무일에 저장된 운수사 VOC → 리포트용 요약 (2차 발송에서만 사용).
// 테이블 미생성·조회 실패는 빈 배열로 넘겨 리포트 발송 자체는 막지 않는다.
async function loadVocSummaries(date: string): Promise<VocOperatorSummary[]> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("vocs")
      .select("operator, date, items, notes")
      .eq("date", date);
    if (error) throw error;
    return summarizeVocs((data ?? []) as VocRow[]);
  } catch (e) {
    console.warn("[report/send] VOC 조회 실패(VOC 없이 발송):", e instanceof Error ? e.message : e);
    return [];
  }
}

// 1차 발송 내용 저장 키 — 2차 발송 폼이 특이사항·운행시작 점검·계획수량을 자동으로
// 이어받기 위해 app_settings에 날짜별로 저장한다(마이그레이션 불필요).
const stage1Key = (date: string) => `daily_report_stage1:${date}`;

// GET /api/report/send?date=YYYY-MM-DD → 그 날짜의 1차 발송 내용(없으면 null).
// 2차 폼 프리필용 — 조회 실패는 null로 넘겨 새로 입력하면 된다.
export async function GET(req: NextRequest) {
  const date = (req.nextUrl.searchParams.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ draft: null });
  }
  try {
    const raw = await getSetting(stage1Key(date));
    return NextResponse.json({ draft: raw ? JSON.parse(raw) : null });
  } catch {
    return NextResponse.json({ draft: null });
  }
}

// POST /api/report/send  → 금일 완료 리포트 발송
//  - stage 1(1차): 팀즈 완료보고 카드만 전송 (메일 없음)
//  - stage 2(2차): 운수사 VOC를 덧붙여 팀즈 카드 + 메일(엑셀 첨부) 발송
export async function POST(req: NextRequest) {
  const body = (await req.json()) as SendBody;

  if ((body.pw ?? "") !== adminPassword() && !isAdmin()) {
    return NextResponse.json({ error: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const date = (body.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "날짜(date)가 올바르지 않습니다." }, { status: 400 });
  }

  const user = process.env.GMAIL_ADDRESS;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return NextResponse.json(
      { error: "메일 설정이 없습니다. (GMAIL_ADDRESS / GMAIL_APP_PASSWORD)" },
      { status: 500 },
    );
  }

  // 받는사람: 요청값 > 관리자 페이지 저장값(DB) > env REPORT_MAIL_TO > 발신자 본인
  let recipients = parseRecipients(body.to);
  if (recipients.length === 0) {
    recipients = parseRecipients((await getSetting(REPORT_MAIL_KEY)) ?? undefined);
  }
  if (recipients.length === 0) recipients = parseRecipients(process.env.REPORT_MAIL_TO);
  if (recipients.length === 0) recipients = [user];

  // 리포트 데이터 — 진행현황/일정 통계 재사용
  let report;
  try {
    const [ip, sch] = await Promise.all([loadInstallProgress(), loadScheduleStats()]);
    report = buildReport({
      date,
      completedList: ip.completedList,
      scheduleDays: sch.days,
      cumDone: ip.complete,
      cumPlanned: sch.totalPlanned,
      plannedOverride: typeof body.planned === "number" ? body.planned : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "리포트 생성 실패" },
      { status: 500 },
    );
  }

  const notes = body.notes ?? "";
  const check = body.check;
  const stage = body.stage === 1 ? 1 : 2;
  // VOC는 2차에서만 붙인다.
  const vocs = stage === 2 ? await loadVocSummaries(date) : [];
  const text = formatReportText(report, notes, check, vocs);
  const html = formatReportHtml(report, notes, check, vocs);
  const subject = `[인천버스 B820] 설치 완료 보고 (${report.label}, ${report.dow}) — ${report.dailyDone}대`;

  // 1차 — 메일 없이 팀즈 완료보고 카드만 전송.
  if (stage === 1) {
    try {
      await sendCompletionReportCard(report, notes, check);
    } catch (e) {
      return NextResponse.json(
        { error: "팀즈 전송 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
        { status: 500 },
      );
    }
    // 1차 내용 저장 — 2차 폼이 자동으로 불러온다. 저장 실패해도 1차 발송은 성공 처리.
    try {
      await setSetting(
        stage1Key(date),
        JSON.stringify({
          notes,
          planned: typeof body.planned === "number" ? body.planned : null,
          check: check ?? null,
        }),
      );
    } catch (e) {
      console.warn("[report/send] 1차 내용 저장 실패(2차 프리필 생략):", e instanceof Error ? e.message : e);
    }
    return NextResponse.json({ ok: true, stage, to: [], teams: true, attached: false });
  }

  // 진행현황 엑셀 첨부 (실패해도 메일은 발송)
  const attachments: { filename: string; content: Buffer }[] = [];
  try {
    const xlsx = await buildProgressXlsx();
    attachments.push({ filename: xlsx.filename, content: xlsx.buffer });
  } catch (e) {
    console.warn("[report/send] 엑셀 첨부 생성 실패(첨부 없이 발송):", e instanceof Error ? e.message : e);
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `B820 설치현황 <${user}>`,
      to: recipients.join(", "),
      subject,
      text,
      html,
      attachments,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "메일 발송 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }

  // 팀즈 '설치 진행중' 공유방에도 완료보고 카드 전송 (실패해도 메일 발송 결과는 성공 유지)
  let teams = false;
  try {
    await sendCompletionReportCard(report, notes, check, vocs);
    teams = true;
  } catch (e) {
    console.warn("[report/send] 팀즈 완료보고 카드 전송 실패:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({
    ok: true,
    stage,
    to: recipients,
    subject,
    attached: attachments.length > 0,
    teams,
    vocOperators: vocs.length,
  });
}
