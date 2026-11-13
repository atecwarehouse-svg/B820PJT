import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { DEFAULT_SLUG } from "@/lib/project";
import { FEATURES } from "@/lib/features";
import { getSetting, setSetting } from "@/lib/settings";
import { FAQ_MATCH, HELP_FAQ_KEY, HELP_MISSED_KEY, bestFaq, cleanFaq, cleanMissed, parseFaq } from "@/lib/help-faq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 사용법 도우미(챗봇) — 관리자 전용 질문·답변. 프로젝트 데이터를 읽거나 바꾸지 않는다.
// 사전 우선: 질문·답변 사전(lib/help-faq, 관리자가 편집)에서 비슷한 질문을 찾으면 그 답을 그대로 주고,
// 없을 때만 AI(Gemini)가 사전 + 사용 방법 페이지(/help) + 아래 보충 설명을 근거로 답한다.
// 자동 학습: AI가 답한 질문은 사전에 { auto: true }로 쌓이고, 답 못한 질문은 help_missed에 쌓인다.
// GET → { faq, missed } · PUT { faq, missed? } → 사전 저장 · POST { messages: [{ role: "user"|"bot", text }] } → { text, source: "사전"|"학습"|"AI" }

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// ponytail: /help 페이지에 아직 없는 최근 기능 설명을 여기 둠 — /help에 옮겨 적으면 이 블록은 지운다.
const EXTRA = `
[운수사 배차표 엑셀 기능 — '운수사 배차표 엑셀' 기능을 켠 프로젝트(공항 B830)]
- 홈 → 배차표 → '🗂 노선별 배차표 (운수사 엑셀)': 운수사가 준 배차표 엑셀을 📤 엑셀 업로드로 올리면 노선별 표로 본다. 04시~09시 이전 첫 출발 차량만 표시, 날짜에 맞는 표(평일 또는 토·휴일) 하나만 표시. 파일 안 날짜별로 저장되어 배차 날짜를 고를 수 있다.
- 업로드하면 엑셀에 있는 차량의 진행현황 노선명이 엑셀 노선으로 바뀐다(표기는 기존 이름 유지). 저장 문구에 '노선 N개 · 차량 N대 읽음'과 경고(⚠)가 나온다.
- 배차표의 나가는 시간: 저장된 시간이 없으면 설치일 다음 날 배차표의 첫 출발 시간이 자동으로 들어간다('배차표 자동' 표시). 손으로 넣은 시간이 우선.
- 캡쳐용 표: '📋 표로 보기 (캡쳐용)'과 '📸 설치완료 차량 리스트 (캡쳐용)'. 칸은 번호·노선·차고지·차량번호·운행시작·출발지·운행종료·입차순번. '💾 이미지 저장'으로 PNG 저장(폰은 공유 창).

[프로젝트 기능 선택]
- 켜고 끌 수 있는 기능: ${FEATURES.map((f) => `${f.label}(${f.desc})`).join(" / ")}
- 기능을 끄면 버튼·메뉴만 사라진다. 수량 차감 방식, 리포트 승무사원 교육 고정 문구도 같은 화면에서 정한다.
`;

let helpCache: { text: string; at: number } | null = null;
// 사용 방법 페이지 본문(태그 제거) — 10분 캐시. 못 읽으면 빈 문자열로 두고 사전·보충 설명만으로 답한다.
async function helpText(origin: string): Promise<string> {
  if (helpCache && Date.now() - helpCache.at < 600_000) return helpCache.text;
  try {
    const html = await (await fetch(`${origin}/help`, { signal: AbortSignal.timeout(8000) })).text();
    const text = html
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 60000);
    helpCache = { text, at: Date.now() };
    return text;
  } catch {
    return "";
  }
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
// 관리자만 — 이 프로젝트 관리자 또는 마스터(B820) 관리자 쿠키
const allowed = async () => (await isAdmin()) || (await isAdmin(DEFAULT_SLUG));
// 사전은 모든 프로젝트 공용이라 기본 프로젝트(public) 설정에 둔다
const loadFaq = async () => parseFaq(await getSetting(HELP_FAQ_KEY, DEFAULT_SLUG));

const loadMissed = async (): Promise<string[]> => {
  try {
    return cleanMissed(JSON.parse((await getSetting(HELP_MISSED_KEY, DEFAULT_SLUG)) ?? "[]"));
  } catch {
    return [];
  }
};
// 자동 학습 — 실패해도 답변은 그대로 준다.
// ponytail: 읽고-고쳐-쓰기라 동시에 두 명이 물으면 한 건이 빠질 수 있다(관리자 몇 명만 쓰는 기능). 필요하면 전용 테이블로.
async function learn(q: string, a: string) {
  try {
    const faq = await loadFaq();
    if (faq.length < 200) await setSetting(HELP_FAQ_KEY, JSON.stringify([...faq, { q, a, auto: true }]), DEFAULT_SLUG);
  } catch (e) {
    console.error("help-bot learn", e);
  }
}
async function noteMissed(q: string) {
  try {
    await setSetting(HELP_MISSED_KEY, JSON.stringify(cleanMissed([...(await loadMissed()), q])), DEFAULT_SLUG);
  } catch (e) {
    console.error("help-bot missed", e);
  }
}

export async function GET() {
  if (!(await allowed())) return bad("관리자 로그인이 필요합니다.", 401);
  return NextResponse.json({ faq: await loadFaq(), missed: await loadMissed() });
}

export async function PUT(req: NextRequest) {
  if (!(await allowed())) return bad("관리자 로그인이 필요합니다.", 401);
  const body = await req.json().catch(() => null);
  const faq = cleanFaq(body?.faq);
  if (!faq.length) return bad("질문과 답변이 모두 적힌 항목이 하나 이상 있어야 합니다.");
  try {
    await setSetting(HELP_FAQ_KEY, JSON.stringify(faq), DEFAULT_SLUG);
    if (Array.isArray(body?.missed)) await setSetting(HELP_MISSED_KEY, JSON.stringify(cleanMissed(body.missed)), DEFAULT_SLUG);
  } catch (e) {
    return bad(`저장 실패: ${e instanceof Error ? e.message : ""}`, 500);
  }
  return NextResponse.json({ faq, missed: await loadMissed() });
}

export async function POST(req: NextRequest) {
  if (!(await allowed())) return bad("관리자 로그인이 필요합니다.", 401);
  const body = await req.json().catch(() => null);
  const messages = (Array.isArray(body?.messages) ? body.messages : [])
    .slice(-10)
    .map((m: { role?: unknown; text?: unknown }) => ({
      role: m?.role === "bot" ? "model" : "user",
      parts: [{ text: String(m?.text ?? "").slice(0, 1000) }],
    }))
    .filter((m: { parts: { text: string }[] }) => m.parts[0].text.trim());
  if (!messages.length || messages[messages.length - 1].role !== "user") return bad("질문을 입력하세요.");

  // 1) 사전 — 비슷한 질문이 있으면 그 답을 그대로(AI 호출 없음)
  const faq = await loadFaq();
  const question = messages[messages.length - 1].parts[0].text.trim();
  const hit = bestFaq(faq, question);
  if (hit && hit.score >= FAQ_MATCH)
    return NextResponse.json({ text: hit.faq.a, source: hit.faq.auto ? "학습" : "사전", matched: hit.faq.q });

  // 2) AI 보조 — 사전에 없는 질문만
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return bad("사전에 없는 질문입니다. (AI 보조를 쓸 수 없음 — GEMINI_API_KEY 미설정)", 503);
  // 대화는 user로 시작해야 한다(잘린 앞부분이 답변이면 버린다)
  while (messages[0].role !== "user") messages.shift();

  const system = [
    "너는 '프로젝트 산출물 관리' 앱(버스 단말기 설치 사진첩·배차표·진행현황 관리)의 사용법 도우미다.",
    "아래 [질문·답변 사전]과 [사용 설명]에 있는 내용만 근거로 한국어로 짧고 정확하게 답하라. 사전에 맞는 답이 있으면 그 내용을 우선하라.",
    "어느 화면에서 어떤 버튼을 누르는지 순서대로 알려줘라.",
    "근거에 없는 내용은 지어내지 말고 '설명서에 없는 내용이라 정확히 답하기 어렵습니다'라고 말하라.",
    "너는 설정이나 데이터를 직접 바꿀 수 없다 — 바꾸는 방법만 안내하라. 비밀번호·키 같은 것은 묻지도 알려주지도 마라.",
    "",
    "[질문·답변 사전]",
    ...faq.map((f) => `Q: ${f.q}\nA: ${f.a}`),
    "",
    "[사용 설명]",
    await helpText(req.nextUrl.origin),
    EXTRA,
  ].join("\n");

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(40000),
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages,
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (res.status === 429) return bad("사전에 없는 질문이고, 지금은 AI 사용 한도에 걸렸습니다. 아래 사전 질문에서 골라 보거나 잠시 뒤 다시 물어봐 주세요.", 429);
    if (!res.ok) {
      console.error("help-bot gemini", res.status, (await res.text()).slice(0, 300));
      return bad("사전에 없는 질문이고, AI 응답도 받지 못했습니다. 잠시 뒤 다시 시도해 주세요.", 502);
    }
    const json = await res.json();
    const text = (json?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim();
    if (!text) return bad("답변을 만들지 못했습니다. 질문을 바꿔 다시 물어봐 주세요.", 502);
    // 자동 학습 — 답을 한 질문은 사전에 쌓고, 답하지 못한 질문은 따로 쌓아 관리자가 답을 적게 한다.
    // 이어 묻는 말("그럼 그건?")은 앞 대화 없이는 뜻이 없어 첫 질문만 쌓는다.
    if (/설명서에 없는/.test(text)) await noteMissed(question);
    else if (messages.length === 1) await learn(question, text);
    return NextResponse.json({ text, source: "AI" });
  } catch {
    return bad("AI 응답이 늦어 중단했습니다. 다시 시도해 주세요.", 504);
  }
}
