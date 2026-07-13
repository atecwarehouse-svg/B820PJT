import Link from "next/link";

export const metadata = {
  title: "앱 소개 — B820 설치 사진첩",
  description: "인천버스 B820 단말기 설치 사진첩 앱 기능 소개",
};

// 앱 소개 페이지 — 지금까지 만든 기능 전체를 역할·흐름별로 정리한 정적 페이지.
export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-20 pt-6">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-blue-600">
          ← 처음으로
        </Link>
        <h1 className="text-lg font-bold text-blue-700">앱 소개</h1>
        <span className="w-14" />
      </div>

      {/* 개요 */}
      <section className="rounded-2xl bg-blue-600 p-5 text-white shadow">
        <h2 className="text-xl font-bold">🚌 B820 설치 사진첩</h2>
        <p className="mt-2 text-sm leading-relaxed text-blue-100">
          인천버스 교통카드 단말기(B820) 구축사업의 <b className="text-white">설치 사진 기록 ·
          진행 관리 · 보고 자동화</b>를 한곳에서 처리하는 웹앱입니다. 현장 작업자는 휴대폰으로
          사진을 올리고, 관리자는 대시보드에서 진행 현황을 확인하며, 보고서는 자동으로
          만들어집니다.
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-xs text-blue-100 sm:grid-cols-4">
          <li className="rounded-lg bg-white/10 px-2 py-1.5 text-center">대상 차량 2,739대</li>
          <li className="rounded-lg bg-white/10 px-2 py-1.5 text-center">사진 저장 Google Drive</li>
          <li className="rounded-lg bg-white/10 px-2 py-1.5 text-center">알림 Microsoft Teams</li>
          <li className="rounded-lg bg-white/10 px-2 py-1.5 text-center">휴대폰 홈화면 설치(PWA)</li>
        </ul>
      </section>

      {/* 작업 흐름 */}
      <SectionTitle emoji="🛠️" title="현장 작업 흐름 (작업자)" />
      <Card>
        <ol className="space-y-3 text-sm text-gray-700">
          <Step n={1} title="차량번호 입력">
            첫 화면에서 차량번호를 입력하면 자동완성으로 차량을 찾아 사진첩 작성 페이지로
            이동합니다.
          </Step>
          <Step n={2} title="차량 이상유무 확인 (8종)">
            작업 시작 전 전광판 · 차량계기판 · 안내방송 · 타코메타 · 시계 · CCTV · 전자노선도 ·
            빈좌석표시기를 촬영합니다. 장비가 없는 항목은 <b>‘없음’ 체크</b>, 이상 내용은{" "}
            <b>비고(필수)</b>에 기록합니다.
          </Step>
          <Step n={3} title="설치 전 사진 (7칸 + 추가 가능)">
            차량번호 · GPS안테나 · 운전자 조작기 · 통합단말기 · 승차/하차 단말기를 촬영합니다.
            하차 단말기가 없는 차량은 ‘단말기 없음’ 체크로 대신합니다.
          </Step>
          <Step n={4} title="설치 후 사진 (7칸)">
            설치 완료된 장비 사진을 칸에 맞춰 올립니다. 사진은 자동 압축되고, 회전(눕혀 찍힘)된
            사진은 AI가 걸러냅니다.
          </Step>
          <Step n={5} title="특이사항 작성 + 팀명 선택 → 저장">
            특이사항(필수)을 적고 팀명을 드롭다운에서 선택한 뒤 <b>저장</b>을 누르면 목록에
            등록되고 팀즈 알림이 발송됩니다. 팀명은 한번 저장되면 관리자만 변경할 수 있습니다.
          </Step>
        </ol>
      </Card>
      <Card>
        <h3 className="text-sm font-bold text-gray-800">📸 사진 저장 방식</h3>
        <ul className="mt-2 space-y-1.5 text-sm text-gray-600">
          <li>· 모든 원본 사진은 Google Drive에 <b>운수사 / 차량번호</b> 폴더로 자동 정리</li>
          <li>· 차량 이상유무 사진은 차량 폴더 안 <b>차량이상유무(차량번호)</b> 폴더에 별도 보관 (PDF·엑셀 미포함)</li>
          <li>· 칸마다 1장 — 다시 찍으면 자동으로 교체</li>
        </ul>
      </Card>
      <Card>
        <h3 className="text-sm font-bold text-gray-800">🔔 팀즈 자동 알림 (차량별)</h3>
        <ul className="mt-2 space-y-1.5 text-sm text-gray-600">
          <li>
            · <b>설치 시작</b> — 이상유무 8칸 + 설치전 7칸이 모두 채워진 상태에서 저장하면 발송
          </li>
          <li>· <b>설치 완료</b> — 설치 전/후 14칸이 모두 채워진 상태에서 저장하면 사진과 함께 발송</li>
          <li>· 카드에 차량이상 비고(빨간 강조)·특이사항이 함께 표시</li>
          <li>· 사진·내용을 수정하고 다시 저장하면 최신 내용으로 재발송</li>
          <li>· <b>관리자 호출</b> — 현장에서 버튼 한 번으로 관리자 채팅방에 호출 카드 전송</li>
        </ul>
      </Card>

      {/* 대시보드 */}
      <SectionTitle emoji="📊" title="진행 현황 대시보드" />
      <Card>
        <ul className="space-y-1.5 text-sm text-gray-600">
          <li>· 설치 진행현황 요약 — 금일/누적 완료, 진행률 (완료 = 저장 + 설치 전·후 사진 완료)</li>
          <li>· KPI 카드 — 완료 / 진행중 / 설치대상, 진행중 차량 목록 팝업</li>
          <li>· 설치 일정 차트 — 날짜별 계획·실적, 시범설치/본설치 구분</li>
          <li>· 운수사별 · 영업소별 진행 현황, 날짜별 완료 차량 검색</li>
          <li>· 설치팀 확인 — 팀별 누적 설치 대수, 운수사별 차량 목록</li>
        </ul>
      </Card>
      <Card>
        <h3 className="text-sm font-bold text-gray-800">🔘 대시보드 버튼</h3>
        <ul className="mt-2 space-y-1.5 text-sm text-gray-600">
          <li>· <b>설치계획 보고</b> — 집합시간·장소·협의사항을 팀즈 2개 채팅방에 맞춤 발송</li>
          <li>· <b>설치시작 보고</b> — 금일 계획을 운수사·노선별로 정리해 발송</li>
          <li>· <b>설치진행중 공유</b> — 금일 계획 / 진행중 / 금일완료 / 누적완료 / 잔여 카드 발송 (매일 02시 자동 발송도 동일)</li>
          <li>· <b>금일 완료 리포트</b> — 메일 발송 (아래 보고 자동화 참고)</li>
          <li>· <b>진행현황 다운로드</b> — 기준일을 골라 엑셀 스냅샷 다운로드 (비밀번호 보호)</li>
          <li>· <b>운수사 협의사항</b> — 16개 항목 협의 폼 → 팀즈 카드 전송</li>
          <li>· <b>설치일정 변경 업로드</b> — 수정한 엑셀을 올리면 미리보기 후 일정 반영 (빠진 차량 자동 정리)</li>
        </ul>
      </Card>

      {/* 보고 자동화 */}
      <SectionTitle emoji="📤" title="보고서 · 다운로드 자동화" />
      <Card>
        <ul className="space-y-1.5 text-sm text-gray-600">
          <li>
            · <b>진행현황 엑셀</b> — 회사 보고 양식 그대로, 수식·피벗·차트를 보존한 채 완료
            현황을 채워 생성. 차량 수·운수사·노선·예정일은 항상 최신 DB와 자동으로 맞춰짐
          </li>
          <li>
            · <b>금일 완료 리포트 메일</b> — 실적/계획, 영업소별 완료 목록, 누적 현황을 정리해
            Gmail로 발송 (진행현황 엑셀 자동 첨부, 수신자는 관리자 페이지에서 관리)
          </li>
          <li>· <b>차량별 사진첩</b> — 저장 목록에서 차량별 PDF/엑셀 다운로드</li>
          <li>· <b>운수사별 차량 목록</b> — 운수사 선택 → 차량번호 목록 복사/다운로드</li>
        </ul>
      </Card>

      {/* 안전관리 서약서 */}
      <SectionTitle emoji="🖊️" title="안전관리 서약서 (전자 서명)" />
      <Card>
        <ul className="space-y-1.5 text-sm text-gray-600">
          <li>· 안전관리자가 세션을 만들고 공유 링크로 작업자들이 휴대폰 서명</li>
          <li>· 설치 전 서명 → 작업 → 설치 종료 후 설치 후 서명 (링크 분리, 같은 세션에 취합)</li>
          <li>· 완성된 서약서는 PDF로 만들어 Google Drive에 자동 보관</li>
        </ul>
      </Card>

      {/* 관리자 */}
      <SectionTitle emoji="🔒" title="관리자 기능" />
      <Card>
        <ul className="space-y-1.5 text-sm text-gray-600">
          <li>· <b>설치팀 관리</b> — 팀명 드롭다운 선택지 추가/수정 (팀명 변경 승인 권한)</li>
          <li>· <b>완료리포트 메일 수신자 관리</b></li>
          <li>· <b>운수사 협의사항 관리</b> — 저장된 협의 내용 확인</li>
          <li>· <b>기준(양식) 사진 관리</b> — 칸별 올바른 예시 사진 등록</li>
          <li>· <b>차량 삭제</b> — 잘못 올린 차량의 사진(Drive 포함)·기록 일괄 삭제</li>
        </ul>
      </Card>

      {/* 기술 요약 */}
      <SectionTitle emoji="⚙️" title="이렇게 만들어져 있어요" />
      <Card>
        <ul className="space-y-1.5 text-sm text-gray-600">
          <li>· 웹앱 — 설치 없이 브라우저로 사용, 휴대폰 홈 화면에 앱처럼 추가 가능(PWA)</li>
          <li>· 사진 원본 Google Drive · 데이터 Supabase · 배포 Vercel(자동 배포)</li>
          <li>· 알림 Microsoft Teams 워크플로 · 메일 Gmail</li>
          <li>· 사진 업로드 시 자동 압축 + AI(Gemini) 회전 검사</li>
        </ul>
      </Card>

      <p className="mt-8 text-center text-xs text-gray-400">
        (주)에이텍모빌리티 · 인천버스 B820 단말기 구축사업
      </p>
    </main>
  );
}

function SectionTitle({ emoji, title }: { emoji: string; title: string }) {
  return (
    <h2 className="mb-2 mt-7 flex items-center gap-2 text-base font-bold text-gray-800">
      <span>{emoji}</span>
      {title}
    </h2>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">{children}</div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
        {n}
      </span>
      <div>
        <p className="font-semibold text-gray-800">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-gray-500">{children}</p>
      </div>
    </li>
  );
}
