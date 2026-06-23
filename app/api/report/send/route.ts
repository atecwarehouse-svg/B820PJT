import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { loadInstallProgress, loadScheduleStats } from "@/lib/stats";
import { buildReport, formatReportText, formatReportHtml } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface SendBody {
  date?: string; // 업무일 YYYY-MM-DD
  notes?: string;
  to?: string; // 받는사람 (쉼표/세미콜론 구분). 없으면 env 기본값
}

function parseRecipients(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

// POST /api/report/send  → 금일 완료 리포트를 Gmail SMTP로 발송
export async function POST(req: NextRequest) {
  const body = (await req.json()) as SendBody;
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

  // 받는사람: 요청값 우선, 없으면 env REPORT_MAIL_TO, 그래도 없으면 발신자 본인
  let recipients = parseRecipients(body.to);
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
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "리포트 생성 실패" },
      { status: 500 },
    );
  }

  const notes = body.notes ?? "";
  const text = formatReportText(report, notes);
  const html = formatReportHtml(report, notes);
  const subject = `[B800] 설치 완료 보고 (${report.label}, ${report.dow}) — ${report.dailyDone}대`;

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
    });
  } catch (e) {
    return NextResponse.json(
      { error: "메일 발송 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, to: recipients, subject });
}
