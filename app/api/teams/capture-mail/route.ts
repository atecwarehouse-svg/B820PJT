import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { kstDateString } from "@/lib/work-day";
import { buildCaptureXlsx, type CaptureRow } from "@/lib/export/build-capture-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 설치팀별 확인 캡쳐 이미지·정리 엑셀을 입력한 메일주소로 발송 (report/send와 같은 Gmail 설정).
// 공개 페이지에서 호출되므로 수신자 수·이미지 수·용량을 제한한다.
export async function POST(req: NextRequest) {
  const b = (await req.json()) as {
    to?: string;
    label?: string; // 검색 조건 요약 — 제목·본문용
    images?: { name?: string; data?: string }[]; // data = base64 PNG
    rows?: CaptureRow[]; // 검색 결과 — 엑셀 첨부용
  };

  const recipients = (b.to ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
    .slice(0, 5);
  if (!recipients.length) {
    return NextResponse.json({ error: "받는 메일주소를 입력하세요." }, { status: 400 });
  }

  const attachments: { filename: string; content: Buffer }[] = [];
  let total = 0;
  for (const img of (Array.isArray(b.images) ? b.images : []).slice(0, 30)) {
    if (typeof img?.data !== "string" || !img.data) continue;
    const content = Buffer.from(img.data, "base64");
    total += content.length;
    attachments.push({ filename: (img.name ?? "capture.png").toString().slice(0, 80), content });
  }
  if (!attachments.length) {
    return NextResponse.json({ error: "보낼 이미지가 없습니다." }, { status: 400 });
  }
  if (total > 15 * 1024 * 1024) {
    return NextResponse.json(
      { error: "이미지 용량이 너무 큽니다. 검색을 좁혀 다시 시도하세요." },
      { status: 400 },
    );
  }

  const user = process.env.GMAIL_ADDRESS;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return NextResponse.json(
      { error: "메일 설정이 없습니다. (GMAIL_ADDRESS / GMAIL_APP_PASSWORD)" },
      { status: 500 },
    );
  }

  const label = (b.label ?? "").toString().slice(0, 120);
  const imageCount = attachments.length;

  // 검색 결과 엑셀 첨부 — 실패해도 이미지 메일은 발송
  const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 5000);
  if (rows.length) {
    try {
      attachments.push({
        filename: `설치팀별현황_${kstDateString()}.xlsx`,
        content: await buildCaptureXlsx(rows, label, kstDateString()),
      });
    } catch (e) {
      console.warn(
        "[teams/capture-mail] 엑셀 생성 실패(이미지만 발송):",
        e instanceof Error ? e.message : e,
      );
    }
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
      subject: `[인천버스 B820] 설치팀별 설치 현황${label ? ` (${label})` : ""}`,
      text: `설치팀별 설치 현황 캡쳐 ${imageCount}장${
        attachments.length > imageCount ? "과 정리 엑셀" : ""
      }을 첨부합니다.${label ? `\n검색 조건: ${label}` : ""}`,
      attachments,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "메일 발송 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류") },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    to: recipients,
    count: imageCount,
    xlsx: attachments.length > imageCount,
  });
}
