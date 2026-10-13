// 로우데이터(전개현황 엑셀) 열 안내 — 프로젝트 생성 폼·최초 업로드 팝업·사용방법에서 같이 쓴다.
// 열 위치는 새 양식(lib/import/vehicle-columns.ts V2_COLS)과 맞춰 둔다. 앱은 1행 제목 이름으로 열을 찾는다.
export const RAW_DATA_COLS: { col: string; name: string; need: "필수" | "권장" | "선택"; note: string }[] = [
  { col: "A", name: "번호", need: "선택", note: "차량 순번(숫자). 리포트 정렬에 씀" },
  { col: "B", name: "운수사", need: "필수", note: "비면 그 행은 건너뜀. 진행현황·전개일정의 운수사 행이 이 값으로 만들어짐" },
  { col: "C", name: "노선", need: "필수", note: "비면 그 행은 건너뜀" },
  { col: "D", name: "차고지", need: "권장", note: "운수사별 첫 값이 진행현황 차고지 칸에 들어감" },
  { col: "E", name: "운수사 주소", need: "권장", note: "운수사별 첫 행만 읽어 홈 날씨·일정 팝업에 씀" },
  { col: "F", name: "차량번호", need: "필수", note: "예: 인천70바4005. 같은 번호가 여러 행이면 마지막 행" },
  { col: "J", name: "설치 대상", need: "권장", note: "「대상」(비워도 대상). 「제외」·「말소」면 등록·집계에서 빠지고 리스트에만 남음" },
  { col: "K", name: "설치 예정일", need: "권장", note: "날짜 셀 또는 2026.07.30 형식. 같은 날짜 차량 수가 그 날 계획수량. 비면 '미정'" },
  { col: "N", name: "연식", need: "선택", note: "예: 2023" },
  { col: "P", name: "모델명", need: "선택", note: "예: 유니버스 수소" },
  { col: "Z", name: "타코 제조사", need: "선택", note: "배차표 타코 확인 표시용" },
];

const TONE = { 필수: "bg-rose-100 text-rose-700", 권장: "bg-amber-100 text-amber-700", 선택: "bg-gray-100 text-gray-500" };

// projectName: 빈 양식 시트 제목 "(프로젝트명) 설치 진행현황"에 넣을 이름 (없으면 "(프로젝트명)" 그대로)
// start/end: 프로젝트 기간(YYYY-MM-DD) — 빈 양식 요약 줄·예시 차량의 설치 예정일에 쓴다
export default function RawDataGuide({
  open = false,
  projectName = "",
  start = "",
  end = "",
}: { open?: boolean; projectName?: string; start?: string; end?: string }) {
  const q = new URLSearchParams();
  if (projectName.trim()) q.set("name", projectName.trim());
  if (start && end) {
    q.set("start", start);
    q.set("end", end);
  }
  const href = `/api/import/schedule/template${q.size ? `?${q}` : ""}`;
  return (
    <details open={open} className="group rounded-xl bg-white/80 text-xs text-gray-600 ring-1 ring-black/5">
      <summary className="cursor-pointer select-none px-3 py-2 font-semibold text-gray-700">
        📑 엑셀 어느 열에 뭘 넣나요? <span className="font-normal text-gray-400 group-open:hidden">(펼치기)</span>
      </summary>
      <div className="space-y-2 px-3 pb-3">
        <a
          href={href}
          download
          className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm active:bg-emerald-700"
        >
          ⬇️ 빈 양식 다운로드 (차량리스트 · 설치 진행현황 · 전개일정 · 일자별 현황)
        </a>
        <p className="leading-relaxed">
          <b>「차량리스트」 시트</b>의 1행은 제목줄, 2행부터 차량 한 대가 한 줄입니다. 나머지 시트(설치 진행현황·설치
          전개일정·설치 일자별 현황)는 전부 차량리스트를 보는 수식이라 <b>차량리스트만 채우면</b> 됩니다.
        </p>
        <div className="overflow-x-auto rounded-lg ring-1 ring-black/5">
          <table className="w-full min-w-[300px] text-left text-[11px]">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-2 py-1.5">열</th>
                <th className="px-2 py-1.5">내용</th>
                <th className="px-2 py-1.5">구분</th>
                <th className="px-2 py-1.5">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {RAW_DATA_COLS.map((c) => (
                <tr key={c.col}>
                  <td className="px-2 py-1.5 font-mono font-bold text-gray-800">{c.col}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-medium text-gray-700">{c.name}</td>
                  <td className="px-2 py-1.5">
                    <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${TONE[c.need]}`}>{c.need}</span>
                  </td>
                  <td className="px-2 py-1.5 text-gray-500">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="space-y-0.5 text-[11px] leading-relaxed text-gray-500">
          <li>· 빈 양식을 열면 맨 앞 「작성 안내」 시트에 작성 순서와 이 표가 그대로 들어 있습니다(업로드할 때 자동으로 빠집니다).</li>
          <li>· 빈 양식 2행의 예시(○○교통 / 예) 인천70바4005)는 지우지 않아도 됩니다(차량번호가 「예)」로 시작하면 건너뜁니다). L·M열(설치 완료여부·완료일)은 앱이 채우는 칸이라 비워 두고, 표에 없는 열(제조사·차대번호 등)은 읽지 않지만 리스트에 그대로 보존됩니다.</li>
          <li>· 열은 1행 제목 이름으로 찾으니 순서가 달라도 되고, 옛 B820 양식(설치 예정일이 I열)을 올려도 인식합니다. 시트 이름은 꼭 「차량리스트」여야 합니다.</li>
          <li>· 운수사 행과 날짜 열은 다운로드 때 차량리스트의 운수사 수·설치 예정일 수만큼 자동으로 늘어납니다. 기준일(설치 진행현황 K1)은 다운로드 때 고른 날짜, 빈 양식에서는 여는 날짜입니다.</li>
          <li>· 설치 예정일은 나중에 「설치일정 변경 업로드」로 바꿀 수 있습니다. 현장실사를 했으면 G·H·I열(실사 예정일·완료여부·완료일)을 적으면 숨겨진 「실사 …」 시트 3개가 함께 집계됩니다.</li>
        </ul>
      </div>
    </details>
  );
}
