"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/project";
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

// 프로젝트 관리 페이지(/projects) 본문 — 런처(마스터) 관리자 쿠키가 있는 상태에서만 렌더된다.
// 위: 추가/수정 폼(미리보기 포함), 아래: 등록된 프로젝트 목록(연필=수정, 휴지통=링크 카드 삭제).
//   앨범 프로젝트: B820과 같은 기능을 이 앱 안에서 쓰는 프로젝트 (자기 DB·드라이브 폴더·관리자 비밀번호)
//   링크 카드  : 다른 앱 주소로 이동하는 바로가기 (예: 공항 현장실사 사진첩)
type Kind = "album" | "link";

const SLUG_RE = /^[a-z][a-z0-9_]{1,19}$/;
const projectHome = (slug: string) => (slug === "b820" ? "/b820" : `/p/${slug}`);

// 프로젝트 ID 입력 정리 — 소문자화, 허용 밖 문자는 _ 로, 20자 제한
function sanitizeSlug(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+/, "").slice(0, 20);
}

// 프로젝트명으로 ID 제안 — 영문·숫자만 뽑아 소문자로(예: "B900 설치 사진첩" → "b900"),
// 영문이 없으면 p+월일(예: p1001). 사용자가 ID 칸을 직접 건드리기 전까지만 자동으로 채운다.
function suggestSlug(name: string): string {
  const ascii = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20);
  if (ascii && /^[a-z]/.test(ascii) && ascii.length >= 2) return ascii;
  if (ascii && /^[0-9]/.test(ascii)) return ("p" + ascii).slice(0, 20);
  const d = new Date();
  return `p${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

// 새 프로젝트에 복사할 B820 설정 (app_settings 키)
const COPY_SETTINGS_LABEL = "B820의 설치팀 목록·배차표 검수항목·리포트 수신자를 복사";

export default function ProjectAdmin({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Project | null>(null); // 수정 중인 프로젝트 (null=추가 모드)
  const [kind, setKind] = useState<Kind>("album");
  const [slug, setSlug] = useState("");
  const [icon, setIcon] = useState<IconKey>("folder");
  const [color, setColor] = useState<ColorKey>("blue");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [adminPw, setAdminPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false); // ID를 직접 편집했으면 자동 제안 중단
  const [copySettings, setCopySettings] = useState(true);
  const [confirmSlug, setConfirmSlug] = useState(""); // 삭제 확인 대기 중인 프로젝트
  const [confirmText, setConfirmText] = useState(""); // 앨범 삭제 확인용 ID 입력
  const [created, setCreated] = useState<{
    name: string;
    home: string;
    exposed: boolean;
    warning?: string;
    copied?: string[];
  } | null>(null);

  function resetForm() {
    setEditing(null);
    setKind("album");
    setSlug("");
    setSlugTouched(false);
    setIcon("folder");
    setColor("blue");
    setName("");
    setDescription("");
    setUrl("");
    setAdminPw("");
    setShowPw(false);
    setCopySettings(true);
    setError("");
  }

  function onNameChange(v: string) {
    setName(v);
    if (!editing && kind === "album" && !slugTouched) setSlug(suggestSlug(v));
  }

  async function call(method: "POST" | "PUT" | "DELETE", body: Record<string, unknown>) {
    if (busy) return null;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 401) {
        router.refresh(); // 쿠키 만료 → 로그인 화면으로
        return null;
      }
      if (!res.ok) {
        setError(String(j.error ?? "요청에 실패했습니다."));
        return null;
      }
      router.refresh(); // 서버에서 목록 다시 읽기
      return j;
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (editing) {
      const body: Record<string, unknown> = { slug: editing.slug, color };
      if (editing.slug !== "b820") {
        Object.assign(body, { name, description, icon });
        if (editing.kind === "link") body.url = url;
        if (editing.kind === "album" && adminPw) body.admin_password = adminPw;
      }
      if (await call("PUT", body)) resetForm();
      return;
    }
    const common = { name, description, icon, color };
    if (kind === "album") {
      const j = await call("POST", {
        kind,
        ...common,
        slug: slug.trim().toLowerCase(),
        admin_password: adminPw,
        copySettings,
      });
      if (j) {
        setCreated({
          name,
          home: String(j.home ?? projectHome(slug)),
          exposed: !!j.exposed,
          warning: j.warning ? String(j.warning) : undefined,
          copied: Array.isArray(j.copied) ? (j.copied as string[]) : undefined,
        });
        resetForm();
      }
    } else if (await call("POST", { kind, ...common, url })) {
      resetForm();
    }
  }

  function startEdit(p: Project) {
    setCreated(null);
    setEditing(p);
    setKind(p.kind);
    setSlug(p.slug);
    setSlugTouched(true);
    setIcon(p.icon);
    setColor(p.color);
    setName(p.name);
    setDescription(p.description);
    setUrl(p.url ?? "");
    setAdminPw("");
    setConfirmSlug("");
    setError("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function remove(p: Project) {
    // 브라우저 confirm 대신 두 번 탭: 첫 탭에서 버튼이 '정말 삭제'로 바뀐다.
    // 앨범 프로젝트는 데이터가 통째로 지워지므로 프로젝트 ID를 입력해야 지워진다.
    if (confirmSlug !== p.slug) {
      setConfirmSlug(p.slug);
      setConfirmText("");
      return;
    }
    const body: Record<string, unknown> = { slug: p.slug };
    if (p.kind === "album") {
      if (confirmText.trim() !== p.slug) {
        setError("확인을 위해 프로젝트 ID를 똑같이 입력하세요.");
        return;
      }
      body.confirm = confirmText.trim();
    }
    setConfirmSlug("");
    if ((await call("DELETE", body)) && editing?.slug === p.slug) resetForm();
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  const isB820 = editing?.slug === "b820";
  const input =
    "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-base transition-colors focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100";
  const canSubmit =
    !busy &&
    (editing
      ? isB820 || !!name
      : kind === "album"
        ? !!name && SLUG_RE.test(slug.trim().toLowerCase()) && adminPw.length >= 4
        : !!name && !!url);

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

      {/* 생성 직후 안내 */}
      {created && (
        <section className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 motion-safe:animate-rise">
          <p className="font-bold">
            {created.exposed ? "✅ " : "⚠️ "}
            {created.name} 프로젝트를 만들었습니다
          </p>
          {created.warning && <p className="mt-2 text-xs leading-relaxed text-amber-800">{created.warning}</p>}
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed">
            <li>
              <a href={created.home} className="font-semibold underline">
                {created.home}
              </a>{" "}
              에서 프로젝트 홈을 엽니다. (첫 화면 카드로도 들어갈 수 있습니다)
            </li>
            <li>
              대시보드 → <b>최초 업로드</b>로 전개현황 엑셀을 올려 차량리스트를 등록합니다.
            </li>
            <li>
              {created.copied?.length
                ? "B820 설정(설치팀·검수항목·리포트 수신자)을 복사했습니다. 관리자(방금 정한 비밀번호)에서 확인·수정하세요."
                : "관리자(방금 정한 비밀번호) → 설치팀·리포트 수신자를 등록합니다."}
            </li>
          </ol>
          <div className="mt-3 flex gap-2">
            <a
              href={`${created.home}/dashboard`}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
            >
              대시보드에서 최초 업로드 →
            </a>
            <button
              type="button"
              onClick={() => setCreated(null)}
              className="rounded-lg bg-white px-3 py-1.5 text-xs text-emerald-800 ring-1 ring-emerald-200"
            >
              닫기
            </button>
          </div>
        </section>
      )}

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
            <span className="line-clamp-2 text-[11px] font-bold leading-tight">{name || "프로젝트명"}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-gray-900">
              {editing ? `${editing.name} 수정` : "새 프로젝트"}
            </h2>
            {!editing && (
              <div className="mt-2 flex rounded-xl bg-gray-100 p-1 text-xs font-semibold">
                {(["album", "link"] as Kind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex-1 rounded-lg py-1.5 transition-colors ${
                      kind === k ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"
                    }`}
                  >
                    {k === "album" ? "앨범 프로젝트" : "링크 카드"}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              {editing
                ? isB820
                  ? "B820은 기본 프로젝트라 카드 색만 바꿀 수 있습니다."
                  : "이름·설명·아이콘·색을 바꿉니다. 왼쪽은 첫 화면에 보일 모습입니다."
                : kind === "album"
                  ? "B820 설치 사진첩과 같은 기능을 가진 프로젝트를 이 앱 안에 만듭니다. 데이터·사진 폴더·관리자 비밀번호가 따로 생깁니다."
                  : "별도로 배포된 앱의 주소를 카드로 등록합니다."}
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
                disabled={isB820}
                aria-label={PROJECT_ICONS[k].label}
                aria-pressed={on}
                className={`flex aspect-square items-center justify-center rounded-xl border-2 transition-all duration-150 disabled:opacity-40 ${
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
          {!isB820 && (
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              maxLength={40}
              placeholder="프로젝트명 (예: B900 설치 사진첩)"
              className={input}
            />
          )}
          {!isB820 && (
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={100}
              placeholder="설명 (선택)"
              className={input}
            />
          )}
          {kind === "album" && !isB820 && (
            <>
              <div>
                <input
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(sanitizeSlug(e.target.value));
                  }}
                  disabled={!!editing}
                  maxLength={20}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="프로젝트 ID (영문) — 이름을 쓰면 자동으로 채워집니다"
                  className={`${input} disabled:text-gray-400`}
                />
                <p className={`mt-1 px-1 text-[11px] ${slug && !SLUG_RE.test(slug) ? "text-red-500" : "text-gray-400"}`}>
                  {slug
                    ? SLUG_RE.test(slug)
                      ? `주소: /p/${slug}`
                      : "영문 소문자로 시작하는 2~20자 (소문자·숫자·_)"
                    : "주소에 쓰이는 영문 ID (예: b900 → /p/b900)"}
                </p>
              </div>
              <div className="relative">
                <input
                  value={adminPw}
                  onChange={(e) => setAdminPw(e.target.value)}
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={editing ? "관리자 비밀번호 변경 (비우면 유지)" : "이 프로젝트의 관리자 비밀번호 (4자 이상)"}
                  className={`${input} pr-14`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] text-gray-500 active:bg-gray-100"
                >
                  {showPw ? "숨기기" : "보기"}
                </button>
              </div>
              {!editing && (
                <label className="flex items-start gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={copySettings}
                    onChange={(e) => setCopySettings(e.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    {COPY_SETTINGS_LABEL}
                    <span className="block text-[11px] text-gray-400">같은 설치팀이 작업하면 켜 두세요. 나중에 관리자에서 바꿀 수 있습니다.</span>
                  </span>
                </label>
              )}
            </>
          )}
          {kind === "link" && !isB820 && (
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="url"
              inputMode="url"
              placeholder="앱 주소 (https://…)"
              className={input}
            />
          )}
          <div className="flex gap-2">
            {editing && (
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
              disabled={!canSubmit}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 py-3 text-sm font-semibold text-white shadow-md shadow-blue-200 transition-transform active:scale-[.98] disabled:opacity-40 disabled:shadow-none"
            >
              <Svg d={editing ? UI.pencil : UI.plus} className="h-4 w-4" />
              {busy
                ? kind === "album" && !editing
                  ? "프로젝트 만드는 중… (10초 정도)"
                  : "처리 중…"
                : editing
                  ? "수정 저장"
                  : kind === "album"
                    ? "프로젝트 만들기"
                    : "링크 카드 추가"}
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
        {projects.map((p) => {
          const ic = PROJECT_ICONS[p.icon];
          const asking = confirmSlug === p.slug;
          const isEditing = editing?.slug === p.slug;
          const sub =
            p.kind === "link"
              ? p.url ?? ""
              : p.slug === "b820"
                ? "이 앱 자체 (/b820) · 기본 프로젝트"
                : `${projectHome(p.slug)} · 앨범 프로젝트`;
          return (
            <li
              key={p.slug}
              className={`flex flex-wrap items-center gap-3 rounded-2xl px-3 py-2.5 shadow-sm ring-1 transition-colors ${
                isEditing ? "bg-blue-50 ring-blue-200" : "bg-white ring-black/5"
              }`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ic.tint}`}>
                <Svg d={ic.d} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-800">{p.name}</span>
                <span className="block truncate text-xs text-gray-400">{sub}</span>
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
                  isEditing ? "bg-blue-600 text-white" : "text-gray-400 active:bg-blue-50 active:text-blue-600"
                }`}
              >
                <Svg d={UI.pencil} className="h-4 w-4" />
              </button>
              {p.slug !== "b820" && (
                <button
                  type="button"
                  onClick={() => remove(p)}
                  disabled={busy || (asking && p.kind === "album" && confirmText.trim() !== p.slug)}
                  aria-label={asking ? "정말 삭제" : `${p.name} 삭제`}
                  className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-xs transition-all duration-150 disabled:opacity-40 ${
                    asking ? "bg-red-600 font-semibold text-white" : "text-gray-400 active:bg-red-50 active:text-red-600"
                  }`}
                >
                  <Svg d={UI.trash} className="h-4 w-4" />
                  {asking && "정말 삭제"}
                </button>
              )}
              {/* 앨범 프로젝트 삭제 확인 — ID를 그대로 입력해야 버튼이 켜진다 */}
              {asking && p.kind === "album" && (
                <div className="mt-2 w-full basis-full rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  <p className="font-semibold">⚠️ 이 프로젝트의 차량·설치기록·사진·서약서 데이터가 전부 삭제됩니다.</p>
                  <p className="mt-1 text-red-700/80">
                    구글드라이브 사진 폴더는 휴지통으로 이동합니다(30일 안에 복구 가능). 되돌릴 수 없으니 확인을
                    위해 프로젝트 ID <b>{p.slug}</b> 를 입력하세요.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder={p.slug}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-base focus:border-red-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmSlug("");
                        setConfirmText("");
                        setError("");
                      }}
                      className="rounded-lg bg-white px-3 py-2 text-xs text-gray-600 ring-1 ring-gray-200"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
