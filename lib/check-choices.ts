// 1단계(설치전 특이사항) 선택 확인 항목 — 공항 B800 전용(record 페이지에서 slug로 켬).
// 별도 컬럼 없이 답을 비고(check_note) 문구와 check_na_slots 키로만 저장하므로
// 저장값이 곧 상태다(재진입해도 유지, 문구를 지우면 다시 미선택).
export type ChoiceOpt = {
  v: string; // 답 값(Y/N/none)
  label: string; // 버튼 글자
  note?: string; // 비고에 넣는 문구(detail이면 접두사 — 뒤에 입력값이 붙는다)
  detail?: boolean; // 선택 시 추가 입력칸(예: 파손 부위) 필수
  naKey?: string; // 문구 없이 check_na_slots에 이 키로만 기록(TV없음)
};
export type ChoiceDef = { key: string; label: string; detailLabel?: string; opts: ChoiceOpt[] };
export type Answer = { v: string; detail: string };
export type Answers = Record<string, Answer | undefined>;

export const B800_CHOICES: ChoiceDef[] = [
  {
    key: "tv",
    label: "라디오모드 AUX(TV) 설정 후 TV소리가 나오는지",
    opts: [
      { v: "Y", label: "Y (소리 나옴)", note: "TV소리 나옴" },
      { v: "N", label: "N (소리 안나옴)", note: "TV소리 안나옴" },
      { v: "none", label: "TV없음", naKey: "check_tv" },
    ],
  },
  {
    key: "radio",
    label: "라디오 정상작동 유무 (D-SPK · P-SPK 모드 모두 확인)",
    opts: [
      { v: "Y", label: "Y (정상)", note: "라디오 정상(D-SPK·P-SPK)" },
      { v: "N", label: "N (이상)", note: "라디오 작동 이상" },
    ],
  },
  {
    key: "damage",
    label: "차량파손 유무",
    detailLabel: "차량파손 부위",
    opts: [
      { v: "Y", label: "Y (파손 있음)", note: "차량파손 부위:", detail: true },
      { v: "N", label: "N (파손 없음)", note: "차량파손 없음" },
    ],
  },
];

const lines = (note: string) => note.split("\n").map((l) => l.trim()).filter(Boolean);

function matchOpt(line: string, o: ChoiceOpt): Answer | null {
  if (!o.note) return null;
  if (o.detail) return line.startsWith(o.note) ? { v: o.v, detail: line.slice(o.note.length).trim() } : null;
  return line === o.note ? { v: o.v, detail: "" } : null;
}

// 비고·없음 체크에서 항목별 답을 읽는다(문구가 없음 키보다 우선).
export function readChoices(defs: ChoiceDef[], note: string, na: string[]): Answers {
  const out: Answers = {};
  const ls = lines(note);
  for (const d of defs) {
    outer: for (const l of ls) {
      for (const o of d.opts) {
        const m = matchOpt(l, o);
        if (m) { out[d.key] = m; break outer; }
      }
    }
    if (!out[d.key]) {
      const o = d.opts.find((o) => o.naKey && na.includes(o.naKey));
      if (o) out[d.key] = { v: o.v, detail: "" };
    }
  }
  return out;
}

// 답 하나를 바꾼 뒤의 비고·없음 체크 — 자동 문구는 항목 순서대로 맨 위, 손으로 쓴 줄은 아래에 유지.
// 자동 문구가 하나라도 있으면 '없음'만 있던 줄은 걷어낸다.
export function writeChoice(
  defs: ChoiceDef[],
  note: string,
  na: string[],
  key: string,
  ans: Answer,
): { note: string; na: string[] } {
  const cur: Answers = { ...readChoices(defs, note, na), [key]: ans };
  const isAuto = (l: string) => defs.some((d) => d.opts.some((o) => matchOpt(l, o)));
  const manual = lines(note).filter((l) => !isAuto(l));
  const naKeys = new Set(defs.flatMap((d) => d.opts.map((o) => o.naKey).filter(Boolean)));
  const nextNa = na.filter((k) => !naKeys.has(k));
  const auto: string[] = [];
  for (const d of defs) {
    const a = cur[d.key];
    const o = a && d.opts.find((o) => o.v === a.v);
    if (!a || !o) continue;
    if (o.naKey) nextNa.push(o.naKey);
    else if (o.note) auto.push(o.detail ? `${o.note} ${a.detail}`.trim() : o.note);
  }
  const rest = auto.length ? manual.filter((l) => l !== "없음") : manual;
  return { note: [...auto, ...rest].join("\n"), na: Array.from(new Set(nextNa)) };
}

// 미선택·추가입력 누락 안내문. 없으면 null.
export function choicesMissing(defs: ChoiceDef[], a: Answers): string | null {
  for (const d of defs) {
    const x = a[d.key];
    if (!x) {
      const vals = d.opts.map((o) => (o.naKey ? o.label : o.v)).join("/");
      return `${d.label} — ${vals} 중 선택해주세요`;
    }
    const o = d.opts.find((o) => o.v === x.v);
    if (o?.detail && !x.detail) return `${d.detailLabel ?? d.label}를 입력해주세요`;
  }
  return null;
}
