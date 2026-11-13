"use client";

// 사용법 도우미(챗봇) — 관리자 화면 오른쪽 아래 버튼.
// 사전 우선: 질문·답변 사전(관리자가 '사전 편집'에서 추가·수정·삭제)에서 답을 찾고, 없을 때만 AI가 보조로 답한다.
// 설정·데이터는 바꾸지 않는다. 대화는 이 화면에만 있고 저장하지 않는다(사전만 저장).
import Icon from "@/components/Icon";
import { useEffect, useRef, useState } from "react";
import { similarity, type Faq } from "@/lib/help-faq";

type Msg = { role: "user" | "bot"; text: string; source?: string };

export default function HelpBot() {
  const [open, setOpen] = useState(false);
  const [faq, setFaq] = useState<Faq[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Faq[] | null>(null); // 사전 편집 중인 사본(null = 대화 화면)
  const [editMsg, setEditMsg] = useState("");
  // 대화 기록 보기(null = 닫힘) — 서버에 쌓인 모든 질문·답, 최근 것부터
  const [log, setLog] = useState<{ at: string; slug: string; q: string; a: string; source: string }[] | null>(null);
  const openLog = () =>
    fetch("/api/help-bot?log=1")
      .then(async (r) => (r.status === 401 ? setLocked(true) : setLog((await r.json()).log ?? [])))
      .catch(() => {});
  const [missed, setMissed] = useState<string[]>([]); // AI도 답하지 못한 질문(자동으로 쌓임)
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, busy]);
  // 관리자 로그인이 안 된 화면(홈 등)에서는 비밀번호부터 받는다 — 맞으면 관리자 쿠키(30분)가 생긴다
  const [locked, setLocked] = useState(false);
  const [pw, setPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  useEffect(() => {
    if (!open || locked || faq.length) return;
    fetch("/api/help-bot")
      .then(async (r) => {
        if (r.status === 401) return setLocked(true);
        const j = await r.json();
        setFaq(j.faq ?? []);
        setMissed(j.missed ?? []);
      })
      .catch(() => {});
  }, [open, locked, faq.length]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setPwMsg("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) return setPwMsg((await res.json().catch(() => null))?.error ?? "비밀번호가 맞지 않습니다.");
      setPw("");
      setLocked(false);
    } catch {
      setPwMsg("네트워크를 확인하세요.");
    } finally {
      setBusy(false);
    }
  }

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/help-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) setLocked(true); // 로그인 30분이 지남 — 비밀번호를 다시 받는다
      if (j.source === "AI") setFaq([]); // AI 답은 서버가 사전·못 답한 질문에 쌓았다 — 목록을 다시 받는다
      setMsgs([
        ...next,
        res.ok && j.text
          ? { role: "bot", text: j.text, source: j.source }
          : { role: "bot", text: `${j.error ?? "답변을 받지 못했습니다."}` },
      ]);
    } catch {
      setMsgs([...next, { role: "bot", text: "네트워크를 확인하세요." }]);
    } finally {
      setBusy(false);
    }
  }

  async function saveFaq() {
    if (!edit || busy) return;
    setBusy(true);
    setEditMsg("");
    try {
      const res = await fetch("/api/help-bot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faq: edit, missed }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setEditMsg(j.error ?? "저장 실패");
      setFaq(j.faq);
      setMissed(j.missed ?? []);
      setEdit(null);
    } catch {
      setEditMsg("저장 실패 — 네트워크를 확인하세요.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="chatbot-fab fixed bottom-4 right-4 z-40 rounded-full bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md active:bg-brand-700"
      >
        <Icon name="chat" /> 챗봇
      </button>
    );
  }

  // 입력 중이면 비슷한 사전 질문, 아니면(대화 시작 전) 사전 앞부분을 보여 준다
  const typed = input.trim();
  const suggest = typed
    ? faq
        .map((f) => ({ f, s: similarity(typed, f.q) }))
        .filter((x) => x.s >= 0.3)
        .sort((a, b) => b.s - a.s)
        .slice(0, 4)
        .map((x) => x.f)
    : msgs.length === 0
      ? faq.slice(0, 6)
      : [];
  const btn = "rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-600 active:bg-gray-200";
  const field = "w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs";

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[80vh] max-w-md flex-col rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/10">
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
        <p className="text-sm font-bold text-gray-800">{edit ? <><Icon name="edit" /> 질문·답변 사전 편집</> : log ? <><Icon name="files" /> 대화 기록</> : <><Icon name="chat" /> 챗봇</>}</p>
        <div className="flex gap-2">
          {!edit && !log && !locked && (
            <button type="button" onClick={openLog} className={btn}>
              <Icon name="files" /> 기록
            </button>
          )}
          {!edit && !log && !locked && (
            <button type="button" onClick={() => { setEditMsg(""); setEdit(faq.map((f) => ({ ...f }))); }} className={btn}>
              <Icon name="edit" /> 사전 편집
            </button>
          )}
          <button type="button" onClick={() => (edit ? setEdit(null) : log ? setLog(null) : setOpen(false))} className={btn}>
            {edit ? "취소" : log ? "← 대화로" : "✕ 닫기"}
          </button>
        </div>
      </div>

      {locked ? (
        <form onSubmit={login} className="flex flex-1 flex-col justify-center gap-3 px-6">
          <p className="text-center text-sm text-gray-600"><Icon name="lock" /> 관리자 비밀번호를 입력하세요</p>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="비밀번호"
            autoFocus
            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm"
          />
          {pwMsg && <p className="text-xs text-red-500">{pwMsg}</p>}
          <button
            type="submit"
            disabled={busy || !pw}
            className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-40"
          >
            {busy ? "확인 중…" : "확인"}
          </button>
        </form>
      ) : log ? (
        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          <p className="text-xs text-gray-500">챗봇에 묻고 답한 내용이 자동으로 남습니다. 최근 500건, 최근 것부터 보입니다.</p>
          {log.length === 0 && <p className="text-sm text-gray-400">아직 기록이 없습니다.</p>}
          {log.map((r, i) => (
            <div key={i} className="space-y-1 rounded-xl border border-gray-200 p-2 text-xs">
              <p className="text-[10px] text-gray-400">
                {new Date(r.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {r.slug} ·{" "}
                <span className={r.source === "실패" ? "text-red-500" : r.source === "사전" ? "text-green-600" : "text-purple-600"}>{r.source}</span>
              </p>
              <p className="font-semibold text-gray-800">Q. {r.q}</p>
              <p className="whitespace-pre-wrap text-gray-600">{r.a}</p>
            </div>
          ))}
        </div>
      ) : edit ? (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            <p className="text-xs text-gray-500">
              여기 적힌 질문과 비슷하게 물으면 답변이 그대로 나옵니다. 모든 프로젝트가 같은 사전을 씁니다.
            </p>
            {missed.length > 0 && (
              <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-2">
                <p className="text-xs font-semibold text-amber-700"><Icon name="help" /> 답하지 못한 질문 — 답을 적어 사전에 넣으세요</p>
                {missed.map((q) => (
                  <div key={q} className="flex items-center gap-1.5 text-xs text-gray-700">
                    <span className="min-w-0 flex-1 break-all">{q}</span>
                    <button
                      type="button"
                      onClick={() => { setEdit([{ q, a: "" }, ...edit]); setMissed(missed.filter((x) => x !== q)); }}
                      className="shrink-0 rounded-lg bg-white px-2 py-1 font-semibold text-blue-700 ring-1 ring-blue-200 active:bg-blue-50"
                    >
                      ＋ 답 적기
                    </button>
                    <button
                      type="button"
                      onClick={() => setMissed(missed.filter((x) => x !== q))}
                      className="shrink-0 rounded-lg bg-white px-2 py-1 font-semibold text-gray-500 ring-1 ring-gray-200 active:bg-gray-50"
                    >
                      지우기
                    </button>
                  </div>
                ))}
              </div>
            )}
            {edit.map((f, i) => (
              <div key={i} className={`space-y-1 rounded-xl border p-2 ${f.auto ? "border-purple-200 bg-purple-50/50" : "border-gray-200"}`}>
                {f.auto && <p className="text-[10px] font-semibold text-purple-600"><Icon name="bot" /> AI가 답해서 자동으로 쌓인 항목 — 틀렸으면 고치거나 삭제하세요 (고치면 표시가 사라집니다)</p>}
                <div className="flex gap-1.5">
                  <input
                    value={f.q}
                    maxLength={200}
                    placeholder="질문"
                    onChange={(e) => setEdit(edit.map((x, k) => (k === i ? { q: e.target.value, a: x.a } : x)))}
                    className={`${field} font-semibold`}
                  />
                  <button
                    type="button"
                    onClick={() => setEdit(edit.filter((_, k) => k !== i))}
                    className="shrink-0 rounded-lg bg-red-50 px-2 text-xs font-semibold text-red-600 active:bg-red-100"
                  >
                    삭제
                  </button>
                </div>
                <textarea
                  value={f.a}
                  maxLength={2000}
                  rows={3}
                  placeholder="답변"
                  onChange={(e) => setEdit(edit.map((x, k) => (k === i ? { q: x.q, a: e.target.value } : x)))}
                  className={field}
                />
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 px-3 py-2.5">
            {editMsg && <p className="mb-1.5 text-xs text-red-500">{editMsg}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEdit([{ q: "", a: "" }, ...edit])}
                className="flex-1 rounded-xl border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700 active:bg-blue-50"
              >
                ＋ 질문 추가
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={saveFaq}
                className="flex-1 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-40"
              >
                {busy ? "저장 중…" : <><Icon name="save" /> 사전 저장</>}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {msgs.length === 0 && (
              <p className="text-xs text-gray-500">
                앱 사용법을 물어보세요. 질문·답변 사전에서 먼저 찾고, 사전에 없으면 AI가 설명서를 근거로 답하고, 그 답은 사전에 자동으로 쌓입니다. 설정이나 데이터를 대신 바꾸지는 않습니다.
              </p>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <p
                  className={`inline-block max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-left text-sm ${
                    m.role === "user" ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {m.text}
                  {m.source && (
                    <span className={`mt-1 block text-[10px] font-semibold ${m.source === "사전" ? "text-green-600" : "text-purple-600"}`}>
                      {m.source === "사전"
                        ? <><Icon name="book" /> 사전 답변</>
                        : m.source === "학습"
                          ? <><Icon name="bot" /> 전에 AI가 답한 내용 — 틀리면 사전 편집에서 고치세요</>
                          : <><Icon name="bot" /> AI 답변 — 틀릴 수 있습니다 (사전에 자동 저장)</>}
                    </span>
                  )}
                </p>
              </div>
            ))}
            {busy && <p className="inline-block animate-pulse rounded-2xl bg-gray-100 px-3 py-2 text-sm text-gray-500">답변 찾는 중…</p>}
            <div ref={endRef} />
          </div>
          {suggest.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-y-auto border-t border-gray-100 px-3 py-2">
              {suggest.map((f) => (
                <button
                  key={f.q}
                  type="button"
                  onClick={() => ask(f.q)}
                  className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-left text-xs text-gray-700 active:bg-gray-100"
                >
                  <Icon name="book" /> {f.q}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex gap-2 border-t border-gray-200 px-3 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              placeholder="궁금한 것을 입력하세요"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="shrink-0 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-40"
            >
              보내기
            </button>
          </form>
        </>
      )}
    </div>
  );
}
