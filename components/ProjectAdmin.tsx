"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/settings";
import {
  CARD_COLORS,
  COLOR_KEYS,
  ICON_KEYS,
  PROJECT_ICONS,
  Svg,
  UI,
  type ColorKey,
  type IconKey,
} from "@/components/ProjectIcon";

// 프로젝트 관리 페이지(/projects) 본문 — 관리자 쿠키가 있는 상태에서만 렌더된다.
// 위: 추가/수정 폼(미리보기 포함), 아래: 등록된 프로젝트 목록(연필=수정, 휴지통=삭제).
// 프로젝트는 별도 배포된 앱 주소(url)로 이동하는 카드일 뿐 — 데이터는 각 앱이 가진다.
export default function ProjectAdmin({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(""); // 수정 중인 프로젝트 (비면 추가 모드)
  const [icon, setIcon] = useState<IconKey>("folder");
  const [color, setColor] = useState<ColorKey>("blue");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [confirmId, setConfirmId] = useState(""); // 삭제 확인 대기 중인 프로젝트

  function resetForm() {
    setEditingId("");
    setIcon("folder");
    setColor("blue");
    setName("");
    setDescription("");
    setUrl("");
    setError("");
  }

  async function call(method: "POST" | "PUT" | "DELETE", body: Record<string, string>) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.refresh(); // 쿠키 만료 → 로그인 화면으로
        return false;
      }
      if (!res.ok) {
        setError(j.error ?? "요청에 실패했습니다.");
        return false;
      }
      router.refresh(); // 서버에서 목록 다시 읽기
      return true;
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const fields = { icon, color, name, description, url };
    const ok = editingId
      ? await call("PUT", { id: editingId, ...fields })
      : await call("POST", fields);
    if (ok) resetForm();
  }

  function startEdit(p: Project) {
    setEditingId(p.id);
    setIcon(p.icon);
    setColor(p.color);
    setName(p.name);
    setDescription(p.description);
    setUrl(p.url);
    setConfirmId("");
    setError("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function remove(p: Project) {
    // 브라우저 confirm 대신 두 번 탭: 첫 탭에서 버튼이 '정말 삭제'로 바뀐다
    if (confirmId !== p.id) {
      setConfirmId(p.id);
      return;
    }
    setConfirmId("");
    if ((await call("DELETE", { id: p.id })) && editingId === p.id) resetForm();
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  const input =
    "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm transition-colors focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100";

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6">
      <div className="mb-5 flex items-center justify-between">
        <Link href="/" className="text-sm text-blue-600">
          ← 프로젝트 선택
        </Link>
        <h1 className="text-lg font-bold text-gray-900">프로젝트 관리</h1>
        <button type="button" onClick={logout} className="text-sm text-gray-400">
          로그아웃
        </button>
      </div>

      {/* 추가/수정 폼 */}
      <section
        ref={formRef}
        className="scroll-mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 motion-safe:animate-rise"
      >
        <div className="mb-4 flex items-start gap-4">
          {/* 첫 화면에 보일 모습 미리보기 */}
          <div
            className={`flex h-28 w-28 shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br p-2 text-center text-white shadow-lg ${CARD_COLORS[color].card}`}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
              <Svg d={PROJECT_ICONS[icon].d} className="h-6 w-6" />
            </span>
            <span className="line-clamp-2 text-[11px] font-bold leading-tight">
              {name || "프로젝트명"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-gray-900">
              {editingId ? "프로젝트 수정" : "새 프로젝트 추가"}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              별도로 배포된 앱의 주소를 카드로 등록합니다. 왼쪽은 첫 화면에 보일 모습입니다.
            </p>
          </div>
        </div>

        <p className="mb-2 text-xs font-semibold text-gray-500">아이콘</p>
        <div className="mb-4 grid grid-cols-5 gap-2">
          {ICON_KEYS.map((k) => {
            const on = icon === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setIcon(k)}
                aria-label={PROJECT_ICONS[k].label}
                aria-pressed={on}
                className={`flex aspect-square items-center justify-center rounded-xl border-2 transition-all duration-150 ${
                  on
                    ? `scale-105 border-blue-500 ${PROJECT_ICONS[k].tint}`
                    : "border-transparent bg-gray-100 text-gray-500 active:bg-gray-200"
                }`}
              >
                <Svg d={PROJECT_ICONS[k].d} className="h-6 w-6" />
              </button>
            );
          })}
        </div>

        <p className="mb-2 text-xs font-semibold text-gray-500">카드 색상</p>
        <div className="mb-4 flex items-center justify-between px-1">
          {COLOR_KEYS.map((k) => {
            const on = color === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setColor(k)}
                aria-label={CARD_COLORS[k].label}
                aria-pressed={on}
                className={`h-8 w-8 rounded-full transition-transform duration-150 ${CARD_COLORS[k].dot} ${
                  on ? "scale-125 ring-2 ring-gray-800 ring-offset-2" : "active:scale-110"
                }`}
              />
            );
          })}
        </div>

        <div className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="프로젝트명 (예: B900 설치 사진첩)"
            className={input}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={100}
            placeholder="설명 (선택)"
            className={input}
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            type="url"
            inputMode="url"
            placeholder="앱 주소 (https://…)"
            className={input}
          />
          <div className="flex gap-2">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                disabled={busy}
                className="rounded-xl bg-gray-100 px-4 py-3 text-sm font-medium text-gray-600 active:bg-gray-200"
              >
                취소
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={busy || !name || !url}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 py-3 text-sm font-semibold text-white shadow-md shadow-blue-200 transition-transform active:scale-[.98] disabled:opacity-40 disabled:shadow-none"
            >
              <Svg d={editingId ? UI.pencil : UI.plus} className="h-4 w-4" />
              {busy ? "처리 중…" : editingId ? "수정 저장" : "프로젝트 추가"}
            </button>
          </div>
          {error && <p className="text-center text-xs text-red-600">{error}</p>}
        </div>
      </section>

      {/* 목록 */}
      <h2 className="mb-2 mt-6 text-xs font-semibold text-gray-500">
        등록된 프로젝트 <span className="font-normal text-gray-400">· 연필을 누르면 수정</span>
      </h2>
      <ul className="space-y-2">
        <li className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-black/5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
            <Svg d={PROJECT_ICONS.bus.d} className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-gray-800">B820 설치 사진첩</span>
            <span className="block text-xs text-gray-400">이 앱 자체 (/b820) · 기본 카드라 수정 불가</span>
          </span>
          <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-blue-600" aria-label="색상 파랑" />
        </li>
        {projects.map((p) => {
          const ic = PROJECT_ICONS[p.icon];
          const asking = confirmId === p.id;
          const editing = editingId === p.id;
          return (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 shadow-sm ring-1 transition-colors ${
                editing ? "bg-blue-50 ring-blue-200" : "bg-white ring-black/5"
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ic.tint}`}
              >
                <Svg d={ic.d} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-800">{p.name}</span>
                <span className="block truncate text-xs text-gray-400">{p.url}</span>
              </span>
              <span
                aria-label={`색상 ${CARD_COLORS[p.color].label}`}
                className={`h-3.5 w-3.5 shrink-0 rounded-full ${CARD_COLORS[p.color].dot}`}
              />
              <button
                type="button"
                onClick={() => startEdit(p)}
                disabled={busy}
                aria-label={`${p.name} 수정`}
                className={`shrink-0 rounded-lg p-2 transition-colors ${
                  editing ? "bg-blue-600 text-white" : "text-gray-400 active:bg-blue-50 active:text-blue-600"
                }`}
              >
                <Svg d={UI.pencil} className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(p)}
                disabled={busy}
                aria-label={asking ? "정말 삭제" : `${p.name} 삭제`}
                className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-xs transition-all duration-150 ${
                  asking
                    ? "bg-red-600 font-semibold text-white"
                    : "text-gray-400 active:bg-red-50 active:text-red-600"
                }`}
              >
                <Svg d={UI.trash} className="h-4 w-4" />
                {asking && "정말 삭제"}
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
