"use client";

// 노선별 배차표 — 운수사가 날마다 주는 배차표 엑셀(04~09시 첫 출발 차량만)을 날짜·노선별 표로 본다.
// 배차표 팝업 안에서 전체화면으로 열린다. 기존 배차표(나가는 시간 입력)와는 별개의 참고 뷰.
import { useEffect, useRef, useState } from "react";
import type { RouteDispatchTable } from "@/lib/route-dispatch";

type Status = Record<string, "done" | "working">;

export default function RouteDispatchView({
  companies,
  initial,
  onClose,
}: {
  companies: string[];
  initial: string;
  onClose: () => void;
}) {
  const [company, setCompany] = useState(initial || companies[0] || "");
  const [table, setTable] = useState<RouteDispatchTable | null>(null);
  const [dates, setDates] = useState<string[]>([]); // 올라온 날짜(최근순)
  const [date, setDate] = useState(""); // "" = 가장 최근
  const [status, setStatus] = useState<Status>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [day, setDay] = useState("");
  const [route, setRoute] = useState(""); // "" = 전체
  const [onlyWork, setOnlyWork] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const apply = (t: RouteDispatchTable | null, s: Status, ds: string[]) => {
    setTable(t);
    setDates(ds ?? []);
    setStatus(s ?? {});
    setRoute("");
    const days = [...new Set((t?.blocks ?? []).map((b) => b.day))];
    // 배차 날짜가 토·일이면 토·휴일 표부터(공휴일은 직접 전환)
    const wd = t?.date ? new Date(`${t.date}T00:00:00Z`).getUTCDay() : -1;
    const want = wd === 0 || wd === 6 ? "토·휴일" : "평일";
    setDay(days.includes(want) ? want : (days[0] ?? ""));
  };

  useEffect(() => {
    if (!company) return;
    const my = ++seq.current;
    setLoading(true);
    setMsg(null);
    fetch(`/api/dispatch/routes?company=${encodeURIComponent(company)}&date=${date}`)
      .then((r) => r.json())
      .then((j) => {
        if (my !== seq.current) return;
        if (j.error) setMsg({ ok: false, text: j.error });
        apply(j.table ?? null, j.status ?? {}, j.dates ?? []);
      })
      .catch(() => my === seq.current && setMsg({ ok: false, text: "불러오지 못했습니다." }))
      .finally(() => my === seq.current && setLoading(false));
  }, [company, date]);

  async function upload(file: File) {
    const my = ++seq.current;
    setLoading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("company", company);
      fd.append("file", file);
      const res = await fetch("/api/dispatch/routes", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({ error: "업로드 실패" }));
      if (my !== seq.current) return;
      if (!res.ok || j.error) setMsg({ ok: false, text: j.error ?? "업로드 실패" });
      else {
        apply(j.table, j.status ?? {}, j.dates ?? []);
        setMsg({ ok: true, text: `${j.table.date} 배차표로 저장했습니다.` });
      }
    } catch {
      if (my === seq.current) setMsg({ ok: false, text: "업로드 실패 — 네트워크를 확인하세요." });
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }

  const days = [...new Set((table?.blocks ?? []).map((b) => b.day))];
  const dayBlocks = (table?.blocks ?? []).filter((b) => b.day === day);
  const shown = dayBlocks
    .filter((b) => !route || b.route === route)
    .map((b) => ({ ...b, rows: onlyWork ? b.rows.filter((r) => status[r.plate]) : b.rows }))
    .filter((b) => b.rows.length > 0);
  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
      on ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-600"
    }`;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-white pb-16" onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5">
        <p className="text-sm font-bold text-gray-800">🗂 노선별 배차표</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-600 active:bg-gray-200"
        >
          ✕ 닫기
        </button>
      </div>

      <div className="space-y-3 px-4 py-3">
        {companies.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {companies.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setDate("");
                  setCompany(c);
                }}
                className={chip(c === company)}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-xs text-gray-600">
              {table ? (
                <>
                  <span className="block truncate font-semibold text-gray-800">{table.fileName}</span>
                  04시~09시 이전 첫 출발 차량만 표시
                </>
              ) : loading ? (
                "불러오는 중…"
              ) : (
                `${company} 배차표가 아직 없습니다. 그날 배차표 엑셀을 올려주세요.`
              )}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) upload(f);
              }}
            />
            <button
              type="button"
              disabled={loading || !company}
              onClick={() => fileRef.current?.click()}
              className="shrink-0 rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-700 active:bg-blue-50 disabled:opacity-50"
            >
              📤 엑셀 업로드
            </button>
          </div>
          {msg && <p className={`mt-1 text-xs ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>}
        </div>

        {/* 배차 날짜 — 파일을 날마다 올리므로 올라온 날짜 중에서 고른다(기본 = 가장 최근) */}
        {dates.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
            배차 날짜
            <select
              value={table?.date ?? ""}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800"
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <span className="text-gray-400">{dates.length}일치 저장됨</span>
          </label>
        )}

        {table && (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {days.length > 1 &&
                days.map((d) => (
                  <button key={d} type="button" onClick={() => setDay(d)} className={chip(d === day)}>
                    {d || "전체"}
                  </button>
                ))}
              <label className="ml-auto flex items-center gap-1.5 py-1.5 text-xs font-medium text-gray-600">
                <input type="checkbox" checked={onlyWork} onChange={(e) => setOnlyWork(e.target.checked)} className="h-4 w-4" />
                작업 차량만
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setRoute("")} className={chip(route === "")}>
                전체 노선
              </button>
              {dayBlocks.map((b) => (
                <button key={b.route} type="button" onClick={() => setRoute(b.route)} className={chip(route === b.route)}>
                  {b.route}
                </button>
              ))}
            </div>

            {shown.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">표시할 차량이 없습니다.</p>
            )}
            {shown.map((b) => (
              <section key={b.route}>
                <h3 className="rounded-t-lg bg-blue-600 px-3 py-1.5 text-sm font-bold text-white">
                  {b.route}
                  <span className="ml-2 text-xs font-medium text-blue-100">
                    {b.day && `${b.day} · `}
                    {b.rows.length}대
                  </span>
                </h3>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100 text-xs text-gray-600">
                      <th className="border border-gray-300 px-1 py-1">출발</th>
                      <th className="border border-gray-300 px-1 py-1">차번</th>
                      <th className="border border-gray-300 px-1 py-1">차량번호</th>
                      <th className="border border-gray-300 px-1 py-1">출발지 · 메모</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, i) => {
                      const st = status[r.plate];
                      return (
                        <tr key={`${r.no}-${i}`} className={st === "done" ? "bg-green-50" : st ? "bg-blue-50" : ""}>
                          <td className="border border-gray-300 px-1 py-1.5 text-center font-bold text-blue-700">{r.time}</td>
                          <td className="border border-gray-300 px-1 py-1.5 text-center text-gray-700">{r.no}</td>
                          <td className="border border-gray-300 px-1 py-1.5 text-center font-medium text-gray-900">
                            {r.plate || "-"}
                            {st && (
                              <span
                                className={`ml-1 whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-semibold text-white ${
                                  st === "done" ? "bg-green-600" : "bg-blue-500"
                                }`}
                              >
                                {st === "done" ? "설치완료" : "작업중"}
                              </span>
                            )}
                          </td>
                          <td className="border border-gray-300 px-1.5 py-1.5 text-xs text-gray-700">
                            {r.from}
                            {r.note && <span className="block text-[11px] text-gray-500">{r.note}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
