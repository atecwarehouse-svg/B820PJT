import Link from "next/link";
import { Svg, UI } from "@/components/ProjectIcon";
import RawDataGuide from "@/components/RawDataGuide";

export const metadata = {
  title: "사용 방법 — 프로젝트 산출물 관리",
};

// 사용 방법 — 런처(/)의 물음표 버튼. 프로젝트와 무관한 정적 안내 페이지.
// 기능이 바뀌면 여기 문구도 같이 고친다(프로젝트별 '앱 소개' 페이지는 10/2 폐기, 이 페이지로 통합).

type Tone = "blue" | "emerald" | "violet" | "amber" | "rose" | "slate" | "teal" | "indigo";
const TONES: Record<Tone, { ring: string; badge: string; chip: string; dot: string }> = {
  blue: { ring: "border-blue-200", badge: "bg-blue-600", chip: "bg-blue-50 text-blue-700", dot: "bg-blue-600" },
  emerald: { ring: "border-emerald-200", badge: "bg-emerald-600", chip: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-600" },
  violet: { ring: "border-violet-200", badge: "bg-violet-600", chip: "bg-violet-50 text-violet-700", dot: "bg-violet-600" },
  amber: { ring: "border-amber-200", badge: "bg-amber-500", chip: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  rose: { ring: "border-rose-200", badge: "bg-rose-500", chip: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  slate: { ring: "border-slate-200", badge: "bg-slate-700", chip: "bg-slate-100 text-slate-700", dot: "bg-slate-700" },
  teal: { ring: "border-teal-200", badge: "bg-teal-600", chip: "bg-teal-50 text-teal-700", dot: "bg-teal-600" },
  indigo: { ring: "border-indigo-200", badge: "bg-indigo-600", chip: "bg-indigo-50 text-indigo-700", dot: "bg-indigo-600" },
};

const NAV: { id: string; label: string; emoji: string }[] = [
  { id: "start", label: "시작하기", emoji: "🚀" },
  { id: "project", label: "프로젝트 만들기", emoji: "🗂️" },
  { id: "record", label: "현장 촬영", emoji: "📸" },
  { id: "home", label: "홈 화면 버튼", emoji: "🏠" },
  { id: "dispatch", label: "배차표", emoji: "🚌" },
  { id: "dashboard", label: "대시보드·보고", emoji: "📊" },
  { id: "download", label: "다운로드", emoji: "📥" },
  { id: "safety", label: "안전 서약서", emoji: "🖊️" },
  { id: "admin", label: "관리자", emoji: "🔒" },
  { id: "tips", label: "팁·문제 해결", emoji: "💡" },
];

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-gray-50 to-gray-100">
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-5">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm text-blue-600 shadow-sm ring-1 ring-black/5"
          >
            ← 프로젝트 선택
          </Link>
          <Link
            href="/projects"
            aria-label="프로젝트 관리"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm ring-1 ring-black/5"
          >
            <Svg d={UI.gear} className="h-4 w-4" />
          </Link>
        </div>

        {/* 머리 */}
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-6 text-white shadow-xl shadow-blue-200 motion-safe:animate-rise">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <Svg d={UI.help} className="h-7 w-7" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-200">User Guide</p>
              <h1 className="text-2xl font-bold tracking-tight">사용 방법</h1>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-blue-100">
            버스 단말기 설치 현장의 <b className="text-white">사진 기록 · 진행 관리 · 보고 자동화</b>를 한곳에서
            처리하는 앱입니다. 프로젝트(사업)마다 차량 데이터·사진 폴더·관리자 비밀번호가 따로 있고, 첫 화면에서
            작업할 프로젝트를 고른 뒤 들어갑니다.
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-2 text-xs text-blue-100 sm:grid-cols-4">
            {["휴대폰 홈 화면 앱(PWA)", "사진 저장 Google Drive", "알림 Microsoft Teams", "리포트 메일 자동 발송"].map((t) => (
              <li key={t} className="rounded-xl bg-white/10 px-2 py-2 text-center ring-1 ring-white/10">
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* 목차 칩 */}
        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-black/5 active:bg-blue-50"
            >
              {n.emoji} {n.label}
            </a>
          ))}
        </nav>

        {/* 1. 시작하기 */}
        <Section id="start" tone="blue" emoji="🚀" title="시작하기" sub="첫 화면 = 프로젝트 선택">
          <ol className="space-y-3">
            <Step n={1} title="프로젝트 카드를 누릅니다">
              첫 화면의 색 카드가 프로젝트입니다. 누르면 그 프로젝트의 홈(차량번호 입력 화면)으로 들어갑니다. 다른
              앱으로 연결된 <b>링크 카드</b>는 해당 앱 주소로 이동합니다.
            </Step>
            <Step n={2} title="오른쪽 위 버튼 두 개">
              <b>?</b> 는 이 사용 방법, <b>톱니바퀴</b>는 프로젝트 관리(추가·수정·삭제)입니다. 프로젝트 관리는 B820
              관리자 비밀번호로 들어갑니다.
            </Step>
            <Step n={3} title="휴대폰 홈 화면에 추가">
              브라우저 메뉴 → <b>홈 화면에 추가</b>를 누르면 앱처럼 아이콘으로 열립니다. 설치 없이 항상 최신판이
              적용됩니다. (프로젝트 홈 맨 아래 <b>v날짜·시각</b>이 배포 버전입니다)
            </Step>
          </ol>
          <Note>
            프로젝트 홈 왼쪽 위 <b>← 프로젝트 선택</b>으로 언제든 첫 화면으로 돌아옵니다.
          </Note>
        </Section>

        {/* 2. 프로젝트 만들기 */}
        <Section id="project" tone="violet" emoji="🗂️" title="프로젝트 만들기" sub="톱니바퀴 → 프로젝트 관리">
          <ol className="space-y-3">
            <Step n={1} title="앨범 프로젝트 / 링크 카드 선택">
              <b>앨범 프로젝트</b>는 B820과 똑같은 기능을 이 앱 안에 새로 만드는 것(차량 데이터·드라이브 사진
              폴더·관리자 비밀번호가 따로 생김), <b>링크 카드</b>는 별도 배포된 다른 앱 주소를 카드로 등록하는
              것입니다.
            </Step>
            <Step n={2} title="이름 · 기간 · 아이콘 · 색 · 프로젝트 ID">
              프로젝트명을 쓰면 영문 ID가 자동으로 제안됩니다(주소 /p/ID). <b>프로젝트 기간</b>(시작일~종료일, 선택)을
              달력으로 고르면 빈 양식의 전개일정 3행에 그 기간 날짜가 하루씩 들어갑니다. 61일이 넘으면 날짜 열이
              그만큼 늘어나고(최대 366일), 만든 뒤에도 연필로 고칠 수 있습니다. 아이콘과 카드 색은 첫 화면에 보이는
              모습이고, 왼쪽 미리보기로 확인하며 고릅니다.
            </Step>
            <Step n={3} title="관리자 비밀번호 · 드라이브 공유">
              이 프로젝트 관리자 페이지에 쓸 비밀번호(4자 이상)를 정합니다. <b>구글드라이브 사진 폴더 링크 공유</b>를
              켜면 링크가 있는 사람은 누구나 사진을 볼 수 있고, 끄면 드라이브 계정 주인만 볼 수 있습니다. (나중에
              수정 가능)
            </Step>
            <Step n={4} title="사진 양식 지정 (선택)">
              <b>사진 양식 지정</b>을 누르면 팝업에서 촬영 칸(설치전 특이사항 · 설치 전 · 설치 후)의 이름을 바꾸고
              추가·삭제·순서 변경을 할 수 있습니다. 안 건드리면 B820 기본 양식이 적용되고, 만든 뒤에도 관리자{" "}
              <b>사진 양식</b> 탭에서 바꿀 수 있습니다.
            </Step>
            <Step n={5} title="서약서 양식 · 차량 리스트">
              <b>안전관리 서약서 양식 지정</b>으로 제목·회사명·교육내용을 바꿀 수 있습니다(기준양식: 버스단말기설치
              양식). <b>차량 리스트</b>는 폼의 「엑셀 어느 열에 뭘 넣나요?」를 펼쳐 <b>빈 양식 다운로드</b>로 받은 엑셀의
              차량리스트 시트만 채워 첨부하면
              만들면서 바로 등록됩니다. <b>나중에 등록</b>을 고르면 대시보드에 처음 들어갈 때 업로드 안내 팝업이 뜹니다.
            </Step>
            <Step n={6} title="만든 뒤 할 일">
              관리자 페이지에서 설치팀을 등록하면 준비 끝입니다. 사진 양식·서약서 양식·메일 수신자는 관리자 탭에서
              언제든 고칠 수 있습니다.
            </Step>
          </ol>
          <p className="pt-1 text-sm font-semibold text-gray-800">📑 전개현황 엑셀(로우데이터) 작성 흐름</p>
          <List
            tone="violet"
            items={[
              ["빈 양식 받기", "아래 「엑셀 어느 열에 뭘 넣나요?」를 펼치면 「빈 양식 다운로드」 버튼이 있습니다. 프로젝트 만들기 화면에서 프로젝트명·기간을 먼저 적고 받으면 시트 제목과 전개일정 날짜에 그대로 들어갑니다."],
              ["작성 안내 시트", "파일을 열면 맨 앞 「작성 안내」 시트에 작성 순서와 열 안내가 있습니다. 업로드할 때 자동으로 빠지니 지우지 않아도 됩니다."],
              ["차량리스트만 채우기", "2행부터 차량 한 대씩. 운수사(B)·노선(C)·차량번호(F)는 필수, 설치 예정일(I)은 권장. G·H열(완료여부·완료일)은 앱이 채우니 비워 둡니다."],
              ["전개일정은 자동", "업로드하면 운수사·노선·차고지·대상수량, 3행 날짜(프로젝트 기간 + 설치 예정일), 날짜별 계획 수량이 차량리스트 기준으로 채워집니다. 날짜가 61일을 넘으면 열이 늘어납니다(최대 366일)."],
              ["진행현황도 자동", "영업소·노선·대상대수는 전개일정을 수식으로 따라가고, 기준일(A10)은 내려받은 날짜입니다. 금일·누적 계획은 날짜별 계획에서 계산됩니다."],
              ["일정이 바뀌면", "같은 파일의 차량리스트를 고쳐 대시보드 「설치일정 변경 업로드」로 올립니다. 전개일정과 날짜별 계획이 다시 계산됩니다."],
            ]}
          />
          <RawDataGuide />
          <Grid>
            <Mini tone="violet" title="수정 (연필)">
              이름·설명·프로젝트 기간·아이콘·색·관리자 비밀번호·드라이브 공유를 바꿉니다. 이름을 바꾸면 드라이브
              폴더명도 같이 바뀝니다. 기간은 시작일·종료일을 둘 다 비우면 지워집니다.
            </Mini>
            <Mini tone="rose" title="삭제 (휴지통)">
              앨범 프로젝트는 ID를 똑같이 입력해야 지워지며, DB와 드라이브 사진 폴더가 <b>영구 삭제</b>됩니다. B820은
              지울 수 없습니다.
            </Mini>
          </Grid>
        </Section>

        {/* 3. 현장 촬영 */}
        <Section id="record" tone="emerald" emoji="📸" title="현장 촬영 (작업자)" sub="차량번호 입력 → 3단계 촬영 → 저장">
          <ol className="space-y-3">
            <Step n={1} title="차량번호 입력">
              프로젝트 홈에서 차량번호를 치면 자동완성으로 차량을 찾아 촬영 페이지로 갑니다. 금일 설치 대상이 아닌
              차량이면 경고 팝업이 뜹니다(뒤로/계속). 증차 차량은 <b>증차 차량</b> 체크로 진행합니다.
            </Step>
            <Step n={2} title="1단계 — 설치전 특이사항">
              설치팀을 고르고 작업 시작 전 상태(전광판 · 계기판 · 안내방송 · 타코메타 · 시계 · CCTV · 전자노선도 ·
              빈좌석표시기 등)를 촬영합니다. 장비가 없으면 <b>없음</b> 체크, 이상 내용은 <b>비고(필수)</b>에 적습니다.
              칸은 그 자리에서 추가할 수 있고, 사진 필수 칸은 없음 체크로 대신할 수 없습니다.
            </Step>
            <Step n={3} title="2단계 — 설치 전 사진">
              차량번호 · GPS안테나 · 운전자 조작기 · 통합단말기 · 승차/하차 단말기 등을 촬영합니다. 하차 단말기가 없는
              차량은 <b>단말기 없음</b> 체크. 여기까지 채우고 저장하면 팀즈에 <b>설치 시작</b> 카드가 갑니다.
            </Step>
            <Step n={4} title="3단계 — 설치 후 사진 + 특이사항 → 저장">
              설치된 장비를 칸에 맞춰 찍고 특이사항(필수)을 적은 뒤 <b>저장</b>하면 목록에 등록되고 팀즈에{" "}
              <b>설치 완료</b> 카드가 사진과 함께 갑니다. 타코케이블 Y자 같은 추가 촬영 칸은 드라이브에만 보관됩니다.
            </Step>
          </ol>
          <Grid>
            <Mini tone="emerald" title="자동 저장 · 이어하기">
              사진·입력은 바로 저장되고, 1·2단계에는 <b>중간 저장</b> 버튼이 있습니다. 다시 들어오면 완료된 단계는
              건너뛰고 이어서 시작합니다.
            </Mini>
            <Mini tone="emerald" title="사진 처리">
              업로드 시 자동 압축, 눕혀 찍힌 사진은 AI가 걸러냅니다. 칸마다 1장이며 다시 찍으면 교체됩니다. 원본은
              드라이브 <b>운수사/차량번호</b> 폴더에 정리됩니다.
            </Mini>
            <Mini tone="emerald" title="수정 · 재발송">
              저장 뒤 사진이나 내용을 고치고 다시 저장하면 팀즈 카드가 최신 내용으로 다시 발송됩니다. 설치팀 이름은
              한 번 저장되면 관리자만 바꿀 수 있습니다.
            </Mini>
            <Mini tone="emerald" title="촬영 사진 폰 저장">
              촬영 페이지의 공유 버튼으로 사진을 휴대폰에 저장할 수 있습니다.
            </Mini>
          </Grid>
        </Section>

        {/* 4. 홈 화면 버튼 */}
        <Section id="home" tone="teal" emoji="🏠" title="프로젝트 홈 버튼" sub="위에서부터 순서대로">
          <List
            tone="teal"
            items={[
              ["🚨 관리자 호출", "현장에서 한 번 누르면 관리자 채팅방에 호출 카드가 갑니다. 연타 방지 쿨다운이 있습니다."],
              ["🚌 배차표", "금일 설치 차량의 나가는 시간·휴차·검수완료·설치제외·타코 미연결 등을 기록합니다. (아래 배차표 참고)"],
              ["📣 운수사 VOC", "최근 완료한 운수사의 차량별 VOC를 적어 진행중 공유방에 보냅니다."],
              ["📞 설치팀 호출", "관리자 비밀번호 후 설치팀 전화번호로 바로 연결합니다."],
              ["📊 진행 현황 (대시보드)", "완료율·KPI·일정 달력·진척율·보고 발송·엑셀 다운로드."],
              ["📋 저장 목록 / 다운로드", "저장된 차량 검색, 차량별 PDF/엑셀, 운수사별 묶음 다운로드."],
              ["🖊️ 안전관리 서약서", "작업자 전자 서명 세션 관리."],
              ["👷 설치팀별 확인", "팀별 누적 설치 현황을 기간·운수사·노선·차량번호로 검색 (비밀번호 없음)."],
              ["🔒 관리자", "설치팀·사진 양식·메일 수신자 등 설정 (프로젝트 관리자 비밀번호)."],
            ]}
          />
          <Note>
            오른쪽 위 <b>날씨</b>는 금일 설치 운수사 차고지 기준 작업 시간대(20시~익일 12시) 예보입니다. 홈의{" "}
            <b>노선 스크린샷</b>은 인천 BIS와 카카오맵을 합쳐 노선 캡처를 만듭니다.
          </Note>
        </Section>

        {/* 5. 배차표 */}
        <Section id="dispatch" tone="amber" emoji="🚌" title="배차표" sub="금일 설치 차량을 한눈에 · 전 기기 공용">
          <List
            tone="amber"
            items={[
              ["나가는 시간", "차량별로 입력하면 시간순으로 정렬됩니다. 자동 입력(첫차 + 간격 + 순번)도 됩니다."],
              ["요약 타일 7칸", "설치대상 · 설치중 · 검수대상 · 검수완료 · 미설치 · 타코 미연결 · 설치제외. 타일을 탭하면 그 차량만 보입니다."],
              ["체크 3개", "휴차 · 검수완료 · 설치제외. 휴차 차량도 설치·검수는 하므로 행은 제자리에 남습니다."],
              ["타코 미연결", "기본은 '타코 정상', 탭하면 사유 팝업이 뜨고 바로 저장됩니다. 금일 리포트 특이사항에 자동 포함됩니다."],
              ["LTE 모뎀불량", "구분·증상·교체 전후 사진을 기록하면 드라이브 LTE모뎀불량 폴더에 저장되고 관리자 호출 방에 알림이 갑니다."],
              ["검수항목 보기", "고정 6항목 + 참고 9항목 체크리스트. 관리자 '검수항목' 탭에서 수정합니다."],
            ]}
          />
        </Section>

        {/* 6. 대시보드 */}
        <Section id="dashboard" tone="indigo" emoji="📊" title="대시보드 · 보고" sub="진행 현황 확인과 보고 발송">
          <Grid>
            <Mini tone="indigo" title="요약 · KPI">
              금일/누적 완료, 진행률, 완료·진행중·설치대상 카드. 금일 설치현황 3타일(대상 = 예정 − 설치제외).
            </Mini>
            <Mini tone="indigo" title="상세 현황 탭">
              운수사별 · 영업소별 · 설치 일정(월별 달력, 날짜 탭하면 노선·모델별 대수) · <b>진척율</b>(일별/주별/월별
              계획 대비 실적).
            </Mini>
            <Mini tone="indigo" title="📢 보고 팝업">
              설치계획 보고 · 설치시작 보고(운수사별 개별 발송, 검수 담당자 지정) · 설치진행중 공유(매일 02시 자동도
              동일) · 운행시작 보고.
            </Mini>
            <Mini tone="indigo" title="금일 완료 리포트">
              실적/계획·영업소별 완료·누적 현황을 정리해 Gmail로 발송(진행현황 엑셀 첨부). 설치제외 사유·타코 미연결이
              특이사항에 자동 포함.
            </Mini>
            <Mini tone="indigo" title="진행현황 엑셀">
              회사 보고 양식 그대로 수식·피벗을 보존한 채 생성. 기준일 선택, 비밀번호 보호.
            </Mini>
            <Mini tone="indigo" title="운수사 협의사항">
              17개 항목 협의 폼 → 팀즈 카드. 저장된 내용은 설치계획 보고에 자동으로 채워집니다.
            </Mini>
            <Mini tone="indigo" title="최초 업로드 / 일정 변경 업로드">
              전개현황 엑셀을 올려 차량 리스트를 등록·갱신합니다. 미리보기 후 반영되고 빠진 차량은 자동 정리됩니다.
              새 프로젝트는 올린 파일의 전개일정(운수사·노선·차고지·대상수량·날짜별 계획)을 차량리스트 기준으로
              채워 진행현황 엑셀 양식으로 저장합니다.
            </Mini>
            <Mini tone="indigo" title="설치팀 확인 팝업">
              팀별 누적 대수와 소요시간 통계(2탭).
            </Mini>
          </Grid>
        </Section>

        {/* 7. 다운로드 */}
        <Section id="download" tone="slate" emoji="📥" title="다운로드" sub="저장 목록 / 다운로드 메뉴">
          <List
            tone="slate"
            items={[
              ["차량별 사진첩", "차량을 골라 PDF 또는 엑셀로. 사진은 엑셀처럼 칸에 맞춰 늘려 전체가 보입니다."],
              ["운수사별 묶음", "운수사 + 기간을 고르면 설치일자 순으로 묶어 PDF/엑셀 한 파일로 (파일명: 기간_운수사명)."],
              ["운수사별 차량 목록", "차량번호 목록을 복사하거나 내려받습니다."],
              ["AI텔레콤 사용내역 엑셀", "배차표의 모뎀불량 기록을 사용내역 양식으로 (관리자)."],
            ]}
          />
          <Note>
            휴대폰에서는 다운로드 대신 <b>공유 시트</b>가 열리는 기기가 있습니다. 파일 앱이나 드라이브에 저장하면
            됩니다.
          </Note>
        </Section>

        {/* 8. 안전 서약서 */}
        <Section id="safety" tone="rose" emoji="🖊️" title="안전관리 서약서" sub="전자 서명">
          <ol className="space-y-3">
            <Step n={1} title="세션 만들기">
              안전관리자가 세션(날짜·장소)을 만들고 공유 링크를 작업자에게 보냅니다.
            </Step>
            <Step n={2} title="설치 전 서명 → 작업 → 설치 후 서명">
              링크가 설치 전/후로 나뉘어 있고 같은 세션에 취합됩니다. 동명이인도 각각 서명할 수 있습니다.
            </Step>
            <Step n={3} title="PDF 보관">
              완성된 서약서는 PDF로 만들어 구글드라이브에 자동 보관되고, 전체 다운로드는 세션별 PDF ZIP입니다.
            </Step>
          </ol>
        </Section>

        {/* 9. 관리자 */}
        <Section id="admin" tone="blue" emoji="🔒" title="관리자 페이지" sub="프로젝트별 관리자 비밀번호 · 탭 구성">
          <Grid>
            <Mini tone="blue" title="설치팀 · 소속">
              팀명·이름·전화·소속(아림기술/모리온) 통합 관리. 카드와 드롭다운에는 팀명+이름만 보입니다.
            </Mini>
            <Mini tone="blue" title="검수항목">
              배차표 ‘검수항목 보기’의 체크리스트.
            </Mini>
            <Mini tone="blue" title="사진 양식">
              촬영 칸(설치전 특이사항 · 설치 전 · 설치 후)의 이름·추가·삭제·순서. 이미 사진이 있는 칸을 지우면 사진은
              남고 화면에서만 숨겨집니다.
            </Mini>
            <Mini tone="blue" title="서약서 양식">
              안전관리 서약서 PDF의 제목·회사명·교육내용·서약 문구. 기준양식은 버스단말기설치 양식.
            </Mini>
            <Mini tone="blue" title="메일 수신자">
              금일 완료 리포트 메일 받는 사람.
            </Mini>
            <Mini tone="blue" title="협의사항 · VOC">
              저장된 운수사 협의 내용과 VOC 확인.
            </Mini>
            <Mini tone="blue" title="모뎀불량">
              LTE 모뎀불량 기록 조회·엑셀.
            </Mini>
            <Mini tone="blue" title="차량 삭제">
              잘못 올린 차량의 사진(드라이브 포함)·기록 일괄 삭제.
            </Mini>
            <Mini tone="blue" title="DB 삭제">
              증차 차량처럼 일정 업로드로는 지워지지 않는 차량을 DB에서 삭제.
            </Mini>
          </Grid>
          <Note>
            B820 프로젝트의 사진 양식은 현장 사진 3만여 장이 걸려 있으니 바꾸지 않습니다. 새 프로젝트는 자유롭게
            조정하세요.
          </Note>
        </Section>

        {/* 10. 팁 */}
        <Section id="tips" tone="amber" emoji="💡" title="팁 · 문제 해결" sub="자주 묻는 것">
          <List
            tone="amber"
            items={[
              ["저장이 안 돼요", "비고(설치전 특이사항)나 특이사항이 비었는지, 사진 필수 칸이 '없음'으로만 돼 있는지 확인하세요."],
              ["팀즈 카드가 안 와요", "설치 시작 카드는 설치전 특이사항 + 설치 전 칸이 모두 채워져야, 완료 카드는 설치 전·후가 모두 채워져야 갑니다."],
              ["다른 프로젝트가 열려요", "마지막으로 연 프로젝트가 기억됩니다. 첫 화면에서 원하는 카드를 다시 누르세요."],
              ["화면이 옛날 같아요", "브라우저를 완전히 닫고 다시 열거나 새로고침하세요. 홈 맨 아래 버전 표기가 바뀌면 최신판입니다."],
              ["사진이 드라이브에 안 보여요", "프로젝트 관리에서 드라이브 폴더 링크 공유가 켜져 있는지 확인하세요. 비공개면 계정 주인만 볼 수 있습니다."],
              ["진행현황 계획수량이 0이에요", "차량리스트 I열(설치 예정일)이 비어 있으면 날짜별 계획을 못 만듭니다. 예정일을 채워 「설치일정 변경 업로드」로 다시 올리세요."],
              ["전개일정 날짜 칸이 모자라요", "61일이 넘으면 업로드나 빈 양식 다운로드 때 열이 자동으로 늘어납니다. 최대 366일이고, 넘는 날짜는 업로드 결과에 안내됩니다."],
            ]}
          />
        </Section>

        <p className="mt-10 text-center text-xs text-gray-400">(주)에이텍모빌리티 · 프로젝트 산출물 관리</p>
      </div>
    </main>
  );
}

function Section({
  id,
  tone,
  emoji,
  title,
  sub,
  children,
}: {
  id: string;
  tone: Tone;
  emoji: string;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <section id={id} className={`mt-6 scroll-mt-4 rounded-3xl border bg-white p-5 shadow-sm ${t.ring}`}>
      <div className="mb-4 flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xl text-white shadow ${t.badge}`}>
          {emoji}
        </span>
        <div>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-gray-500">{children}</p>
      </div>
    </li>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-2">{children}</div>;
}

function Mini({ tone, title, children }: { tone: Tone; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-3">
      <p className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-bold ${TONES[tone].chip}`}>{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-gray-600">{children}</p>
    </div>
  );
}

function List({ tone, items }: { tone: Tone; items: [string, string][] }) {
  return (
    <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-gray-50">
      {items.map(([k, v]) => (
        <li key={k} className="flex gap-3 px-3 py-2.5">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONES[tone].dot}`} />
          <p className="text-[13px] leading-relaxed text-gray-600">
            <b className="text-gray-800">{k}</b> — {v}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-blue-50 px-3 py-2 text-[13px] leading-relaxed text-blue-800">{children}</p>;
}
