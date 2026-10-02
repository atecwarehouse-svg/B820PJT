// 로우데이터(전개현황 엑셀) 열 안내 — 프로젝트 생성 폼·최초 업로드 팝업·사용방법에서 같이 쓴다.
// 열 위치는 lib/import/parse-schedule.ts(차량리스트 시트)·lib/operator-address.ts(E열)와 맞춰 둔다.
const COLS: { col: string; name: string; need: "필수" | "권장" | "선택"; note: string }[] = [
  { col: "A", name: "번호", need: "선택", note: "차량 순번(숫자). 리포트 정렬에 씀" },
  { col: "B", name: "운수사", need: "필수", note: "비면 그 행은 건너뜀" },
  { col: "C", name: "노선", need: "필수", note: "비면 그 행은 건너뜀" },
  { col: "D", name: "차고지", need: "선택", note: "차고지 이름 (참고용)" },
  { col: "E", name: "설치 장소", need: "권장", note: "주소. 운수사별 첫 행만 읽어 홈 날씨·일정 팝업에 씀" },
  { col: "F", name: "차량번호", need: "필수", note: "예: 인천70바4005. 같은 번호가 여러 행이면 마지막 행" },
  { col: "I", name: "설치 예정일", need: "권장", note: "날짜 셀 또는 2026.07.30 형식. 비면 '미정'" },
  { col: "J", name: "연식", need: "선택", note: "예: 2023" },
  { col: "L", name: "모델명", need: "선택", note: "예: 유니버스 수소" },
  { col: "U", name: "타코 제조사", need: "선택", note: "배차표 타코 확인 표시용" },
];

const TONE = { 필수: "bg-rose-100 text-rose-700", 권장: "bg-amber-100 text-amber-700", 선택: "bg-gray-100 text-gray-500" };

// projectName: 빈 양식의 전개일정·진행현황 시트 제목 "(프로젝트명) 진행현황"에 넣을 이름 (없으면 "(프로젝트명)" 그대로)
export default function RawDataGuide({ open = false, projectName = "" }: { open?: boolean; projectName?: string }) {
  const href = projectName.trim() ? `/api/import/schedule/template?name=${encodeURIComponent(projectName.trim())}` : "/api/import/schedule/template";
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
          ⬇️ 빈 양식 다운로드 (차량리스트 · 전개일정 · 진행현황)
        </a>
        <p className="leading-relaxed">
          B820 진행현황 양식 엑셀과 같은 구성입니다. <b>「차량리스트」 시트</b>의 1행은 제목줄, 2행부터 차량
          한 대가 한 줄입니다. 가장 쉬운 방법은 <b>B820 진행현황 엑셀을 내려받아 차량리스트 시트만 바꿔</b> 올리는
          것입니다.
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
              {COLS.map((c) => (
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
          <li>· 빈 양식 2행의 회색 예시는 지우지 않아도 됩니다(차량번호가 「예)」로 시작하면 건너뜁니다). 적지 않은 열(G·H·K 등)은 읽지 않으니 자유롭게 써도 됩니다.</li>
          <li>· 빈 양식에는 「전개일정」·「진행현황」 시트도 들어 있습니다(수식 유지, 값만 비움). 전개일정 5행·진행현황 12행의 회색 예시를 참고해 운수사·노선 행을 채우고, 전개일정 3행에 설치 날짜를 적으세요. 대상수량은 업로드 때 차량리스트에 맞춰 자동 정리되고, 이 파일이 진행현황 다운로드 양식으로도 저장됩니다.</li>
          <li>· 전개일정·진행현황 시트 1행 제목은 「(프로젝트명) 진행현황」처럼 프로젝트명으로 들어갑니다(프로젝트명을 먼저 적고 내려받으면 그 이름이 박힙니다).</li>
          <li>· 시트 이름은 꼭 「차량리스트」여야 합니다. 설치 예정일은 나중에 「설치일정 변경 업로드」로 바꿀 수 있습니다.</li>
        </ul>
      </div>
    </details>
  );
}
