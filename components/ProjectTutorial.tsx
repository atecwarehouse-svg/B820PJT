"use client";

import { useEffect, useState } from "react";
import Link from "@/components/PLink";

// 새 프로젝트 첫 진입 튜토리얼 — 프로젝트 홈(B820 제외)에서 쓴다.
//   · 처음 들어오면 환영 팝업: 「사용방법 보기」 「설정 체크리스트」 「건너뛰기(이번만 / 다시 보지 않기)」
//   · 체크리스트: 관리자 페이지에서 해 둘 설정을 완료 여부(서버 계산)와 바로가기(관리자 탭 딥링크 ?tab=)로 보여준다
//   · 페이지 안내: 홈 버튼·촬영 흐름·관리자 탭이 각각 무엇을 하는지 한 줄씩
//   · 홈에는 "처음 설정 n/N" 띠가 남아 다시 열 수 있다 — 「다시 보지 않기」(localStorage)면 띠도 숨기고 작은 사용방법 링크만 남긴다
// 저장: localStorage tutorial:<slug> = "never" / sessionStorage tutorialSkip:<slug> = "1"(이번만)

export interface SetupStep {
  key: string;
  title: string;
  desc: string; // 무엇을 하는 설정인지 한 줄
  href: string; // 바로가기 (프로젝트 접두사는 PLink가 붙임)
  done: boolean;
  required: boolean; // 필수(미완료면 기능이 막힘) / 선택(기본값으로 동작)
  doneNote?: string; // 완료 상태 설명 (예: 기본 양식 사용 중)
}

const PAGES: { emoji: string; title: string; desc: string; href?: string }[] = [
  { emoji: "🚍", title: "차량번호 입력 → 촬영", desc: "차량번호를 넣으면 3단계 촬영(설치전 특이사항 → 설치 전 → 설치 후)으로 들어갑니다. 사진은 찍는 즉시 저장되고, 저장 버튼에서 팀즈 시작·완료 카드가 나갑니다." },
  { emoji: "🚨", title: "관리자 호출", desc: "현장에서 한 번 누르면 관리자 채팅방에 호출 카드가 갑니다(연타 방지)." },
  { emoji: "🚌", title: "배차표", desc: "금일 설치 차량의 나가는 시간·휴차·검수완료·설치제외·타코 미연결을 기록합니다. 모든 기기가 같은 표를 봅니다.", href: "/b820" },
  { emoji: "📣", title: "운수사 VOC", desc: "최근 완료한 운수사의 차량별 VOC를 적어 진행중 공유방에 보냅니다." },
  { emoji: "📞", title: "설치팀 호출", desc: "관리자 비밀번호 후 등록된 설치팀 전화번호로 바로 연결합니다." },
  { emoji: "📊", title: "진행 현황(대시보드)", desc: "완료율·KPI·설치일정 달력·진척율, 보고 발송(설치 시작/완료 리포트), 진행현황 엑셀 다운로드, 차량리스트 업로드.", href: "/dashboard" },
  { emoji: "📋", title: "저장 목록 · 다운로드", desc: "저장된 차량 검색, 차량별 PDF/엑셀, 운수사별 묶음 다운로드(비밀번호).", href: "/list" },
  { emoji: "🖊️", title: "안전관리 서약서", desc: "작업자 전자 서명 세션(설치 전/후 서명) 관리와 PDF 보관.", href: "/safety" },
  { emoji: "👷", title: "설치팀별 확인", desc: "팀별 누적 설치 현황을 기간·운수사·노선·차량번호로 검색(비밀번호 없음).", href: "/teams" },
  { emoji: "🔒", title: "관리자", desc: "설치팀·소속·검수항목·사진 양식·서약서 양식·메일 수신자·협의사항·VOC·모뎀불량·차량/DB 삭제 탭.", href: "/admin" },
];

const ADMIN_TABS: [string, string][] = [
  ["설치팀", "팀명·이름·전화. 촬영 화면 팀 드롭다운과 팀즈 카드의 팀 표기, 설치팀 호출에 쓰입니다."],
  ["소속", "소속사 목록을 만들고 팀별 소속을 지정합니다. 설치팀별 확인의 그룹 필터에 쓰입니다."],
  ["검수항목", "배차표 「검수항목 보기」에 나오는 점검 항목 목록."],
  ["사진 양식", "촬영 칸 이름·추가·삭제, 사진 필수 칸, 팀즈 설치 시작 카드 발송 시점."],
  ["서약서 양식", "안전관리 서약서 제목·회사명·교육내용."],
  ["메일 수신자", "금일 완료 리포트 메일을 받을 주소(없으면 메일 발송이 막힙니다)."],
  ["협의사항 · VOC · 모뎀불량", "현장에서 올린 운수사 협의사항·VOC·LTE 모뎀불량 기록 조회."],
  ["차량 삭제 · DB 삭제", "차량 기록(드라이브 사진 포함) 삭제, 증차 차량 정리."],
];

type View = "welcome" | "checklist" | "pages" | "skip";

export default function ProjectTutorial({ slug, projectName, steps }: { slug: string; projectName: string; steps: SetupStep[] }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("welcome");
  const [hidden, setHidden] = useState(true); // 띠(배너) 숨김 — "다시 보지 않기"
  const neverKey = `tutorial:${slug}`;
  const skipKey = `tutorialSkip:${slug}`;

  useEffect(() => {
    let never = false;
    let skipped = false;
    try {
      never = localStorage.getItem(neverKey) === "never";
      skipped = sessionStorage.getItem(skipKey) === "1";
    } catch {
      /* 저장소 못 쓰면 매번 띄움 */
    }
    setHidden(never);
    if (!never && !skipped) {
      setView("welcome");
      setOpen(true);
    }
  }, [neverKey, skipKey]);

  const done = steps.filter((s) => s.done).length;
  const requiredLeft = steps.filter((s) => s.required && !s.done).length;

  const skipOnce = () => {
    try {
      sessionStorage.setItem(skipKey, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };
  const skipForever = () => {
    try {
      localStorage.setItem(neverKey, "never");
    } catch {
      /* ignore */
    }
    setHidden(true);
    setOpen(false);
  };
  const show = (v: View) => {
    setView(v);
    setOpen(true);
  };

  const btn = "rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm";

  return (
    <>
      {/* 홈 띠 — 다시 열기 */}
      {!hidden && (
        <button
          type="button"
          onClick={() => show(requiredLeft ? "checklist" : "pages")}
          className="mt-3 flex w-full items-center justify-between rounded-2xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 shadow-sm ring-1 ring-amber-200 active:bg-amber-100"
        >
          <span>
            🧭 <b>처음 설정 안내</b> · {done}/{steps.length} 완료
            {requiredLeft ? <span className="ml-1 text-xs text-amber-700">(필수 {requiredLeft}개 남음)</span> : null}
          </span>
          <span className="text-xs text-amber-700">보기 →</span>
        </button>
      )}
      <p className="mt-2 text-center text-xs">
        <a href="/help" className="text-gray-400 underline-offset-2 hover:underline">
          📖 사용방법 보기
        </a>
        {hidden && (
          <>
            <span className="mx-1 text-gray-300">·</span>
            <button type="button" onClick={() => show("checklist")} className="text-gray-400 underline-offset-2 hover:underline">
              설정 안내 다시 열기
            </button>
          </>
        )}
      </p>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={skipOnce}>
          <div
            className="flex max-h-[88vh] w-full max-w-md flex-col rounded-3xl bg-white shadow-xl motion-safe:animate-rise"
            onClick={(e) => e.stopPropagation()}
          >
            {view === "welcome" && (
              <div className="p-5 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-3xl">🧭</span>
                <h2 className="mt-3 text-base font-bold text-gray-900">{projectName}에 처음 오셨나요?</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  관리자 페이지에서 해 둘 설정이 몇 가지 있습니다. 체크리스트를 따라가면 끝나고, 각 페이지가 무슨 일을
                  하는지도 한 줄씩 볼 수 있습니다.
                </p>
                <div className="mt-4 grid gap-2">
                  <a href="/help" className={`${btn} bg-blue-600 text-white active:bg-blue-700`}>
                    📖 사용방법 보기
                  </a>
                  <button type="button" onClick={() => setView("checklist")} className={`${btn} bg-amber-500 text-white active:bg-amber-600`}>
                    ✅ 설정 체크리스트 ({done}/{steps.length})
                  </button>
                  <button type="button" onClick={() => setView("pages")} className={`${btn} bg-white text-gray-700 ring-1 ring-black/5 active:bg-gray-100`}>
                    🗺️ 페이지별 기능 안내
                  </button>
                  <button type="button" onClick={() => setView("skip")} className="mt-1 text-sm text-gray-400 underline-offset-2 hover:underline">
                    건너뛰기
                  </button>
                </div>
              </div>
            )}

            {view === "skip" && (
              <div className="p-5 text-center">
                <h2 className="text-base font-bold text-gray-900">건너뛰기</h2>
                <p className="mt-2 text-sm text-gray-500">홈의 「처음 설정 안내」 띠와 아래 「사용방법 보기」 링크로 언제든 다시 볼 수 있습니다.</p>
                <div className="mt-4 grid gap-2">
                  <button type="button" onClick={skipOnce} className={`${btn} bg-blue-600 text-white active:bg-blue-700`}>
                    이번만 닫기
                  </button>
                  <button type="button" onClick={skipForever} className={`${btn} bg-white text-gray-700 ring-1 ring-black/5 active:bg-gray-100`}>
                    다시 보지 않기
                  </button>
                  <button type="button" onClick={() => setView("welcome")} className="mt-1 text-sm text-gray-400 underline-offset-2 hover:underline">
                    ← 돌아가기
                  </button>
                </div>
              </div>
            )}

            {(view === "checklist" || view === "pages") && (
              <>
                <div className="flex items-center gap-1 border-b border-gray-100 p-2">
                  {(["checklist", "pages"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${view === v ? "bg-blue-600 text-white" : "text-gray-500 active:bg-gray-100"}`}
                    >
                      {v === "checklist" ? `✅ 설정 체크리스트 ${done}/${steps.length}` : "🗺️ 페이지별 기능"}
                    </button>
                  ))}
                  <button type="button" onClick={skipOnce} aria-label="닫기" className="rounded-xl px-3 py-2 text-gray-400 active:bg-gray-100">
                    ✕
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {view === "checklist" ? (
                    <ul className="space-y-2">
                      {steps.map((s, i) => (
                        <li key={s.key} className={`rounded-2xl p-3 ring-1 ${s.done ? "bg-emerald-50 ring-emerald-100" : "bg-white ring-black/5"}`}>
                          <div className="flex items-start gap-2">
                            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                              {s.done ? "✓" : i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-800">
                                {s.title}
                                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${s.required ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-500"}`}>
                                  {s.required ? "필수" : "선택"}
                                </span>
                              </p>
                              <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{s.desc}</p>
                              {s.done && s.doneNote && <p className="mt-0.5 text-[11px] text-emerald-700">{s.doneNote}</p>}
                            </div>
                            <Link href={s.href} className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white active:bg-blue-700">
                              {s.done ? "열기" : "하기 →"}
                            </Link>
                          </div>
                        </li>
                      ))}
                      <li className="rounded-2xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
                        팀즈 카드(설치 시작·완료·보고)는 B820과 같은 채팅방으로 가고 제목에 프로젝트명이 붙습니다. 완료 여부는 홈을
                        새로고침하면 다시 계산됩니다.
                      </li>
                    </ul>
                  ) : (
                    <div className="space-y-4">
                      <ul className="space-y-1.5">
                        {PAGES.map((p) => (
                          <li key={p.title} className="flex items-start gap-2 rounded-2xl bg-white p-3 ring-1 ring-black/5">
                            <span className="text-xl leading-none">{p.emoji}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-800">{p.title}</p>
                              <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{p.desc}</p>
                            </div>
                            {p.href && p.href !== "/b820" && (
                              <Link href={p.href} className="shrink-0 text-xs font-semibold text-blue-600">
                                열기 →
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-gray-600">🔒 관리자 탭</p>
                        <ul className="space-y-1.5">
                          {ADMIN_TABS.map(([t, d]) => (
                            <li key={t} className="rounded-2xl bg-white p-3 ring-1 ring-black/5">
                              <p className="text-sm font-semibold text-gray-800">{t}</p>
                              <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{d}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <a href="/help" className="block rounded-2xl bg-blue-50 px-4 py-3 text-center text-sm font-semibold text-blue-700 active:bg-blue-100">
                        📖 더 자세한 사용방법 보기
                      </a>
                    </div>
                  )}
                </div>
                <div className="border-t border-gray-100 p-3">
                  <button type="button" onClick={() => setView("skip")} className="w-full text-center text-xs text-gray-400 underline-offset-2 hover:underline">
                    건너뛰기 · 다시 보지 않기
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
