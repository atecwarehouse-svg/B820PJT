"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "@/components/PLink";
import { downloadUrl } from "@/lib/download";
import { fmtDone, shortRoute } from "./HandoverChecklist";

interface Worker {
  center: string;
  rank: string;
  name: string;
}
interface Vehicle {
  plate: string;
  operator: string;
  route: string;
  done_at: string | null;
  done_by: string | null;
  note: string | null;
}
interface Settings {
  centers: Record<string, string>;
  workers: Worker[];
  offices: { name: string; count: number }[];
}
interface ImportResult {
  total: number;
  added: number;
  removed: number;
  removedPlates: string[];
  offices: { name: string; count: number }[];
  applied: boolean;
}

const TABS = ["차량 업로드", "센터 배정", "작업자", "현황"] as const;
type Tab = (typeof TABS)[number];

const input = "rounded-lg border border-gray-300 bg-gray-50 px-2 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white";

// 양도양수 체크리스트 관리자 — 로우데이터 업로드 · 영업소→센터 배정 · 작업자 명단 · 현황(엑셀)
export default function HandoverAdmin({ projectName }: { projectName: string }) {
  const router = useRouter();
  const wanted = useSearchParams()?.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(wanted && (TABS as readonly string[]).includes(wanted) ? wanted : "차량 업로드");
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/handover/settings", { cache: "no-store" });
      if (res.status === 401) return router.refresh();
      const j = (await res.json()) as Settings & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "불러오기 실패");
      setS(j);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "불러오기 실패" });
    }
  }, [router]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-5">
      <div className="page-head">
        <Link href="/b820" className="pill">
          ← 홈
        </Link>
        <h1>관리자</h1>
        <button type="button" onClick={logout} className="pill-muted text-xs">
          로그아웃
        </button>
      </div>
      <p className="mb-3 text-xs text-gray-500">{projectName} · 양도양수 체크리스트</p>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 text-xs font-semibold">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setMsg(null);
            }}
            className={`flex-1 whitespace-nowrap rounded-lg px-2 py-2 ${tab === t ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {msg && <p className={`mb-3 rounded-xl px-3 py-2 text-xs ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>}

      {tab === "차량 업로드" && <UploadTab onApplied={loadSettings} setMsg={setMsg} />}
      {tab === "센터 배정" && s && <CentersTab s={s} setS={setS} setMsg={setMsg} />}
      {tab === "작업자" && s && <WorkersTab s={s} setS={setS} setMsg={setMsg} />}
      {tab === "현황" && <StatusTab setMsg={setMsg} />}
      {tab !== "차량 업로드" && tab !== "현황" && !s && <p className="py-8 text-center text-sm text-gray-400">불러오는 중…</p>}
    </main>
  );
}

type SetMsg = (m: { ok: boolean; text: string } | null) => void;

// ---------- 차량 업로드 ----------
function UploadTab({ onApplied, setMsg }: { onApplied: () => void; setMsg: SetMsg }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(apply: boolean) {
    if (!file || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("apply", apply ? "true" : "false");
      const res = await fetch("/api/handover/import", { method: "POST", body: form });
      const j = (await res.json().catch(() => ({}))) as ImportResult & { error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setPreview(j);
      if (apply) {
        setMsg({ ok: true, text: `반영했습니다 — 차량 ${j.total}대 (추가 ${j.added}·삭제 ${j.removed})` });
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        onApplied();
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "업로드 실패" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-800">📂 로우데이터(노선별 차량현황) 업로드</h2>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        첫 행 머리글에 <b>버스영업소명 · 버스노선명 · 차량번호</b>가 있는 엑셀. 차량번호 기준으로 등록되고(공동배차 차량은 노선을 이어 1대로),
        이미 완료 체크된 차량은 다시 올려도 완료 상태가 유지됩니다. 파일에서 빠진 차량은 삭제됩니다.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xlsm,.xls"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setPreview(null);
        }}
        className="mt-3 block w-full text-xs text-gray-600 file:mr-2 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => send(false)}
          disabled={!file || busy}
          className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 active:bg-gray-200 disabled:opacity-40"
        >
          미리보기
        </button>
        <button
          type="button"
          onClick={() => send(true)}
          disabled={!file || busy}
          className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-40"
        >
          {busy ? "처리 중…" : "반영"}
        </button>
      </div>
      {preview && (
        <div className="mt-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-700">
          <p className="font-semibold">
            {preview.applied ? "반영 결과" : "미리보기"} — 차량 {preview.total}대 · 추가 {preview.added} · 삭제 {preview.removed}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {preview.offices.map((o) => (
              <li key={o.name}>
                {o.name} <span className="text-gray-400">{o.count}대</span>
              </li>
            ))}
          </ul>
          {preview.removedPlates.length > 0 && (
            <p className="mt-1.5 text-red-600">삭제 대상: {preview.removedPlates.slice(0, 20).join(", ")}{preview.removedPlates.length > 20 ? " …" : ""}</p>
          )}
        </div>
      )}
    </section>
  );
}

// ---------- 센터 배정 ----------
function CentersTab({ s, setS, setMsg }: { s: Settings; setS: (s: Settings) => void; setMsg: SetMsg }) {
  const [centers, setCenters] = useState<Record<string, string>>(s.centers);
  const [saving, setSaving] = useState(false);
  const names = [...new Set([...Object.values(centers), ...s.workers.map((w) => w.center)])].filter(Boolean);
  const dirty = JSON.stringify(centers) !== JSON.stringify(s.centers);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/handover/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centers }),
      });
      const j = (await res.json().catch(() => ({}))) as { centers?: Record<string, string>; error?: string };
      if (!res.ok) throw new Error(j.error ?? "저장 실패");
      setS({ ...s, centers: j.centers ?? centers });
      setCenters(j.centers ?? centers);
      setMsg({ ok: true, text: "센터 배정을 저장했습니다." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "저장 실패" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-800">🏢 영업소 → 담당 센터</h2>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        업로드된 차량의 영업소마다 담당 센터명을 적습니다(예: 본사 → 강남센터, 일산영업소 → 강북센터). 작업자는 자기 센터에 배정된 영업소 차량만 봅니다.
      </p>
      {s.offices.length === 0 ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">차량이 없습니다. 「차량 업로드」 탭에서 로우데이터를 먼저 올리세요.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {s.offices.map((o) => (
            <li key={o.name} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-800">{o.name}</span>
                <span className="text-xs text-gray-400">{o.count}대</span>
              </span>
              <input
                value={centers[o.name] ?? ""}
                onChange={(e) => setCenters({ ...centers, [o.name]: e.target.value })}
                list="center-names"
                placeholder="센터명"
                maxLength={30}
                className={`w-32 shrink-0 ${input} ${centers[o.name]?.trim() ? "" : "border-amber-300"}`}
              />
            </li>
          ))}
        </ul>
      )}
      <datalist id="center-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {s.offices.some((o) => !centers[o.name]?.trim()) && s.offices.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">⚠️ 센터가 비어 있는 영업소의 차량은 아무 작업자에게도 보이지 않습니다.</p>
      )}
      <button
        type="button"
        onClick={save}
        disabled={saving || !dirty}
        className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "저장 중…" : dirty ? "저장" : "저장됨 ✓"}
      </button>
    </section>
  );
}

// ---------- 작업자 ----------
function WorkersTab({ s, setS, setMsg }: { s: Settings; setS: (s: Settings) => void; setMsg: SetMsg }) {
  const [rows, setRows] = useState<Worker[]>(s.workers);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(rows) !== JSON.stringify(s.workers);
  const names = [...new Set([...Object.values(s.centers), ...rows.map((w) => w.center)])].filter(Boolean);

  const update = (i: number, patch: Partial<Worker>) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/handover/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workers: rows }),
      });
      const j = (await res.json().catch(() => ({}))) as { workers?: Worker[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "저장 실패");
      setS({ ...s, workers: j.workers ?? rows });
      setRows(j.workers ?? rows);
      setMsg({ ok: true, text: "작업자 명단을 저장했습니다." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "저장 실패" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-800">👤 작업자 명단</h2>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        소속 센터·직급·이름. 작업자는 홈에서 센터→이름을 고르고 <b>직원 비밀번호</b>(프로젝트 관리 → 연필에서 변경)를 입력해 들어옵니다. 명단에서 지우면 그 사람은 더 못 들어옵니다.
      </p>
      {rows.length === 0 && <p className="mt-3 text-center text-xs text-gray-400">등록된 작업자가 없습니다. 추가해 주세요.</p>}
      <ul className="mt-3 space-y-2">
        {rows.map((w, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <input value={w.center} onChange={(e) => update(i, { center: e.target.value })} list="worker-centers" placeholder="센터" maxLength={30} className={`w-24 min-w-0 flex-1 ${input}`} />
            <input value={w.rank} onChange={(e) => update(i, { rank: e.target.value })} placeholder="직급" maxLength={40} className={`w-16 shrink-0 ${input}`} />
            <input value={w.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="이름" maxLength={40} className={`w-20 shrink-0 ${input}`} />
            <button
              type="button"
              onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
              className="shrink-0 rounded-lg border border-red-300 px-2 py-2 text-xs font-semibold text-red-600 active:bg-red-50"
            >
              삭제
            </button>
          </li>
        ))}
      </ul>
      <datalist id="worker-centers">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setRows((r) => [...r, { center: names[0] ?? "", rank: "", name: "" }])}
          className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 active:bg-gray-200"
        >
          + 추가
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중…" : dirty ? "저장" : "저장됨 ✓"}
        </button>
      </div>
    </section>
  );
}

// ---------- 현황 ----------
function StatusTab({ setMsg }: { setMsg: SetMsg }) {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [centers, setCenters] = useState<Record<string, string>>({});
  const [todoOnly, setTodoOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/handover", { cache: "no-store" });
      if (res.status === 401) return router.refresh();
      const j = (await res.json()) as { vehicles?: Vehicle[]; centers?: Record<string, string>; error?: string };
      if (!res.ok) throw new Error(j.error ?? "불러오기 실패");
      setVehicles(j.vehicles ?? []);
      setCenters(j.centers ?? {});
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "불러오기 실패" });
    }
  }, [router, setMsg]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(v: Vehicle) {
    const done = !v.done_at;
    if (!done && !window.confirm(`${v.plate} — ${v.done_by ?? ""}님이 완료한 차량입니다. 완료를 해제할까요?`)) return;
    setBusy(v.plate);
    try {
      const res = await fetch("/api/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: v.plate, done }),
      });
      const j = (await res.json().catch(() => ({}))) as { vehicle?: Vehicle; error?: string };
      if (!res.ok || !j.vehicle) throw new Error(j.error ?? "저장 실패");
      setVehicles((prev) => prev?.map((x) => (x.plate === v.plate ? j.vehicle! : x)) ?? prev);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "저장 실패" });
    } finally {
      setBusy(null);
    }
  }

  if (!vehicles) return <p className="py-8 text-center text-sm text-gray-400">불러오는 중…</p>;
  const total = vehicles.length;
  const done = vehicles.filter((v) => v.done_at).length;
  const centerOf = (v: Vehicle) => centers[v.operator] ?? "미배정";
  const byCenter = new Map<string, { t: number; d: number }>();
  const byRoute = new Map<string, { t: number; d: number; center: string }>();
  for (const v of vehicles) {
    const c = byCenter.get(centerOf(v)) ?? { t: 0, d: 0 };
    c.t++;
    if (v.done_at) c.d++;
    byCenter.set(centerOf(v), c);
    for (const route of v.route.split(" / ")) {
      // 공동배차 차량은 각 노선에 모두 집계(노선 대수 = 로우데이터 행 수)
      const r = byRoute.get(route) ?? { t: 0, d: 0, center: centerOf(v) };
      r.t++;
      if (v.done_at) r.d++;
      byRoute.set(route, r);
    }
  }
  const pct = (d: number, t: number) => (t ? Math.round((d / t) * 100) : 0);
  const shown = todoOnly ? vehicles.filter((v) => !v.done_at) : vehicles;

  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500">전체 진행률</p>
            <p className="text-3xl font-bold tabular-nums text-gray-900">
              {pct(done, total)}
              <span className="text-lg text-gray-400">%</span>
            </p>
          </div>
          <p className="text-sm text-gray-500">
            <b className="text-green-600">{done}</b> / {total}대
          </p>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct(done, total)}%` }} />
        </div>
        <ul className="mt-3 space-y-1 text-xs">
          {[...byCenter.entries()].map(([c, n]) => (
            <li key={c} className="flex justify-between">
              <span className="font-semibold text-gray-700">{c}</span>
              <span className="tabular-nums text-gray-500">
                {n.d}/{n.t} · {pct(n.d, n.t)}%
              </span>
            </li>
          ))}
        </ul>
        <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-xs">
          {[...byRoute.entries()].map(([r, n]) => (
            <li key={r} className="flex justify-between gap-2">
              <span className="min-w-0 truncate text-gray-600">
                {shortRoute(r)} <span className="text-gray-400">· {n.center}</span>
              </span>
              <span className="shrink-0 tabular-nums text-gray-500">
                {n.d}/{n.t} · {pct(n.d, n.t)}%
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={load} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 active:bg-gray-200">
            🔄 새로고침
          </button>
          <button
            type="button"
            onClick={() => downloadUrl("/api/handover/export")}
            className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white active:bg-emerald-700"
          >
            📥 엑셀 다운로드
          </button>
        </div>
      </section>

      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-gray-700">차량 {shown.length}대</h2>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={todoOnly} onChange={(e) => setTodoOnly(e.target.checked)} className="h-4 w-4" />
          미완료만
        </label>
      </div>
      <ul className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        {shown.map((v) => (
          <li key={v.plate} className={`flex items-center gap-2 px-3 py-2 ${v.done_at ? "bg-green-50/60" : ""}`}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-gray-900">{v.plate}</span>
              <span className="block truncate text-[11px] text-gray-500">
                {centerOf(v)} · {shortRoute(v.route)}
                {v.done_at ? ` · ✔ ${v.done_by ?? ""} ${fmtDone(v.done_at)}` : ""}
                {v.note ? ` · 📝 ${v.note}` : ""}
              </span>
            </span>
            <button
              type="button"
              onClick={() => toggle(v)}
              disabled={busy === v.plate}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                v.done_at ? "bg-green-600 text-white" : "bg-white text-gray-500 ring-1 ring-gray-200"
              }`}
            >
              {v.done_at ? "완료" : "미완료"}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-gray-400">차량이 없습니다.</li>}
      </ul>
    </div>
  );
}
