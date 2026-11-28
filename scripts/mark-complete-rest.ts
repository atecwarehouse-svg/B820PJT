// 미설치 47대(세운교통·군내버스) 제외 나머지 미완료 차량 완료 처리 — 1회성 (2026-11-28 요청).
// 실행(미리보기): node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/mark-complete-rest.ts
// 실제 반영:      ... scripts/mark-complete-rest.ts --apply
// saved_at·install_date = 업무일 2026-11-15, team = 관리자, 사진 없는 표준칸만 na_slots에 추가(기존 사진·na 유지).
// complete_notified_at 도 채워 팀즈 완료 카드는 나가지 않음. 결과 표: 완료처리내역/ 폴더 xlsx.
import { mkdirSync } from "node:fs";
import ExcelJS from "exceljs";
import { createServiceClient } from "../lib/supabase/server";
import { loadInstallProgress } from "../lib/stats";
import { stdSlotKeys } from "../lib/slots";
import { getSlotConfig } from "../lib/settings";

const EXCLUDE_OPS = ["세운교통", "군내버스"];
const DATE = "2026-11-15";
const AT = `${DATE}T22:00:00+09:00`; // 업무일(20:00~익일 12:00) 2026-11-15
const TEAM = "관리자";
const APPLY = process.argv.includes("--apply");

type V = { plate: string; operator: string | null; route: string | null };

async function main() {
  const sb = createServiceClient("b820");
  const before = await loadInstallProgress("b820");
  const done = new Set(before.completedList.map((c) => c.plate));
  const all: V[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("vehicles").select("plate, operator, route").order("plate").range(from, from + 999);
    if (error) throw error;
    all.push(...data!);
    if (data!.length < 1000) break;
  }
  const left = all.filter((v) => !done.has(v.plate));
  const excluded = left.filter((v) => EXCLUDE_OPS.includes(v.operator?.trim() ?? ""));
  const targets = left.filter((v) => !EXCLUDE_OPS.includes(v.operator?.trim() ?? ""));
  if (excluded.length !== 47) throw new Error(`제외 대상 47대 아님: ${excluded.length}`);

  const plates = targets.map((v) => v.plate);
  const std = stdSlotKeys(await getSlotConfig("b820"));
  const { data: recs, error: e1 } = await sb.from("records").select("plate, team, na_slots, install_date, year, model").in("plate", plates);
  if (e1) throw e1;
  const { data: photos, error: e2 } = await sb.from("photos").select("plate, slot_key").in("plate", plates);
  if (e2) throw e2;
  const recBy = new Map(recs!.map((r) => [r.plate, r]));

  const rows = targets.map((v) => {
    const r = recBy.get(v.plate);
    const shot = new Set(photos!.filter((p) => p.plate === v.plate).map((p) => p.slot_key));
    const na = [...new Set([...(r?.na_slots ?? []), ...std.filter((k) => !shot.has(k))])];
    return {
      plate: v.plate,
      operator: v.operator,
      route: v.route,
      install_date: DATE,
      team: TEAM,
      na_slots: na,
      saved_at: AT,
      complete_notified_at: AT,
      updated_at: new Date().toISOString(),
      extra_note: `미설치 47대(세운교통·군내버스) 제외 일괄 완료 처리(2026-11-28)${r?.team ? ` — 기존 설치팀 ${r.team}` : ""}`,
      _prevTeam: r?.team ?? "",
      _photos: shot.size,
    };
  });
  console.log(`미완료 ${left.length} = 제외 ${excluded.length} + 완료처리 ${rows.length}`);
  for (const r of rows) console.log(`${r.plate}\t${r.operator}\t${r.route}\t사진 ${r._photos}\t기존팀 ${r._prevTeam || "-"}`);

  // 결과 표 저장
  const wb = new ExcelJS.Workbook();
  const sheet = (name: string, cols: [string, string, number][], data: Record<string, unknown>[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = cols.map(([header, key, width]) => ({ header, key, width }));
    ws.getRow(1).font = { bold: true };
    ws.addRows(data);
  };
  sheet(`완료처리 ${rows.length}대`, [["No", "no", 6], ["차량번호", "plate", 16], ["운수사", "operator", 14], ["노선", "route", 12], ["완료일", "date", 12], ["설치자", "team", 10], ["기존 사진", "photos", 10], ["기존 설치팀", "prev", 14]],
    rows.map((r, i) => ({ no: i + 1, plate: r.plate, operator: r.operator, route: r.route, date: DATE, team: TEAM, photos: r._photos, prev: r._prevTeam })));
  sheet(`미설치 제외 ${excluded.length}대`, [["No", "no", 6], ["차량번호", "plate", 16], ["운수사", "operator", 14], ["노선", "route", 12]],
    excluded.map((v, i) => ({ no: i + 1, ...v })));
  mkdirSync("완료처리내역", { recursive: true });
  const out = `완료처리내역/인천B820_완료처리_${rows.length}대_미설치제외_${excluded.length}대_20261128${APPLY ? "" : "_미리보기"}.xlsx`;
  await wb.xlsx.writeFile(out);
  console.log("표 저장:", out);

  if (!APPLY) return console.log("미리보기 — 반영하려면 --apply");
  const { error } = await sb.from("records").upsert(rows.map(({ _prevTeam, _photos, ...r }) => r), { onConflict: "plate" });
  if (error) throw error;
  const after = await loadInstallProgress("b820");
  console.log("DB 완료", after.complete, "/", after.totalVehicles, "미완료", after.notComplete);
  if (after.notComplete !== excluded.length) throw new Error(`미완료가 ${excluded.length}대 아님: ${after.notComplete}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
