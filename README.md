# B820 설치 사진첩 웹앱

인천 B820 버스 장비 설치 전/후 사진을 **휴대폰(iOS·Android)으로 촬영해 업로드**하면,
원본 엑셀 양식(`B800 설치 사진첩`)과 동일한 레이아웃의 사진첩을 차량별로 생성하고
**엑셀(.xlsx)·PDF로 다운로드**하는 웹앱입니다.

- 차량번호 입력 → 운수사·노선 자동 입력 (차량리스트 2,700여 대)
- 연식·차종은 직접 입력/수정
- 설치 전 항목(칸)은 자유롭게 추가 가능 → 엑셀/PDF에도 자동 반영
- 인증 없음 (URL만 알면 접속/업로드)

## 기술 스택
Next.js(App Router) · Supabase(Postgres = 메타데이터) · **Google Drive(사진 파일)** · ExcelJS · browser-image-compression · GitHub → Vercel

> 사진 *파일*은 Google Drive에 저장하고, 차량/레코드/사진 *메타데이터*는 Supabase Postgres에 저장합니다.
> 화면 표시는 앱 서버가 Drive에서 사진을 받아 `/api/photo/[id]`로 중계합니다(드라이브 공개 링크 불필요).

---

## 1. Supabase 준비 (DB)

1. [supabase.com](https://supabase.com) 에서 새 프로젝트 생성
2. **SQL Editor** 에 `supabase/schema.sql` 전체를 붙여넣고 실행
   - 테이블(vehicles/records/photos) + RLS 생성 (사진 파일은 Google Drive에 저장 → Storage 버킷 불필요)
   - 이미 운영 중인 프로젝트라면, **저장 목록 기능을 위해** `supabase/migration_saved.sql` 도 1회 실행하세요 (`records.saved_at` 컬럼 추가)
3. **Settings → API** 에서 아래 값 복사
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` 키 → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` 키 → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ 비공개, 서버 전용)

## 1-2. Google Drive 준비 (사진 저장소)

개인 Gmail로도 됩니다. 핵심은 **OAuth 동의 화면을 "프로덕션"으로 게시**하는 것 — 그래야 로그인이 7일마다 풀리지 않습니다. `drive.file` 스코프만 쓰므로 구글 검증 절차는 필요 없습니다.

1. [Google Cloud Console](https://console.cloud.google.com) → 새 프로젝트 생성
2. **API 및 서비스 → 라이브러리** → **Google Drive API** 검색 → **사용 설정**
3. **API 및 서비스 → OAuth 동의 화면**
   - User Type: **외부** → 만들기
   - 앱 이름/이메일만 채우고 저장
   - **대상(또는 게시 상태) → 앱 게시 → 프로덕션으로 전환** (⚠️ 중요: 토큰 만료 방지)
   - "테스트 사용자"에 본인 Gmail 추가(게시 전이라면)
4. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **데스크톱 앱** → 만들기
   - 발급된 **클라이언트 ID** → `GOOGLE_CLIENT_ID`, **클라이언트 보안 비밀** → `GOOGLE_CLIENT_SECRET`
5. `.env.local` 에 위 두 값을 넣고 아래 명령 실행 → 브라우저에서 로그인/동의:
   ```bash
   npm run gdrive:setup
   ```
   출력된 `GOOGLE_REFRESH_TOKEN` 과 `GDRIVE_FOLDER_ID` 를 `.env.local`(과 Vercel)에 넣습니다.
   ("내 드라이브 > B820 설치사진" 폴더가 자동 생성됩니다.)

## 2. 로컬 설정 & 차량리스트 적재

```bash
npm install
cp .env.example .env.local   # 값 채우기 (Windows: copy .env.example .env.local)

# 차량리스트.csv (CP949) → vehicles 테이블 적재 (1회)
npm run import:vehicles
# → "✅ vehicles 총 2701 행" 출력 확인
```

## 3. 로컬 실행

```bash
npm run dev
# http://localhost:3000
```

차량번호(예: `인천70바4005`) 입력 → 운수사 `신흥교통(주)`·노선 `93` 자동 표시 확인.

---

## 4. GitHub → Vercel 배포

1. 이 폴더를 GitHub 저장소로 push
   ```bash
   git init && git add . && git commit -m "init"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
   > `.gitignore`가 원본 엑셀/CSV와 `.env*`를 제외합니다.
2. [vercel.com](https://vercel.com) → **New Project** → GitHub 저장소 선택
3. **Environment Variables** 에 환경변수 등록 (`.env.example` 참고)
   - Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Google Drive: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GDRIVE_FOLDER_ID`
4. Deploy → 발급된 URL을 현장 작업자에게 공유 (휴대폰 홈화면에 추가하면 앱처럼 사용)

> **PDF 함수 메모리**: `@sparticuz/chromium`은 메모리를 많이 사용합니다. PDF가 실패하면
> Vercel → Project → Settings → **Functions** 에서 메모리를 1024MB 이상으로 올리세요
> (PDF 라우트는 `maxDuration=60`으로 설정되어 있습니다).

---

## 사용 흐름

1. 차량번호 입력 → 선택
2. 헤더에 운수사·노선·설치일자(오늘)·차량NO 자동 표시, **연식·차종 입력**
3. 각 칸에서 **촬영** 또는 **앨범** 선택 → 자동 압축 후 업로드 (재촬영 시 덮어쓰기)
4. 설치 전 **`+ 항목 추가`** 로 칸 추가 가능
5. 하단 **저장** → 저장 목록에 등록
6. **저장 목록**(홈의 `📋 저장 목록` 또는 `/list`)에서 차량을 **체크박스로 선택** →
   **PDF 다운로드** 또는 **엑셀 다운로드**

> **다운로드 형식**
> - **PDF**: 차량당 1페이지씩 묶인 PDF **한 파일** (headless Chromium 서버 생성)
> - **엑셀**: **한 시트**에 차량별로 이어지며, 차량마다 **페이지 분할**(인쇄 시 차량당 1장)
> - 차량 한 대 = 목록 + 설치 전 + 설치 후가 **A4 한 장**에 모두 들어갑니다
> - PDF는 로컬에선 Chrome/Edge, Vercel에선 `@sparticuz/chromium` 사용

---

## 출력 양식 (원본 엑셀과 동일)

| 구분 | 항목 |
|---|---|
| 헤더 | 설치일자 / 차량NO / 운수사 / 노선 / 연식 / 차종 |
| 설치 전 (6, 추가 가능) | 차량번호 · GPS안테나 · 운전석 통합단말기 사진 · 승차단말기 · 하차1 단말기 · 하차2 단말기 |
| 설치 후 (7, 고정) | GPS안테나 · 통합단말기 · LTE외장모뎀 · 표출기 · 승차단말기 · 하차1 단말기 · 하차2 단말기 |

레이아웃 기하(열폭 15, 라벨행 높이 24.75, 2열×7행 사진셀, 3슬롯/행)는
`lib/export/layout-spec.ts` 한 곳에서 관리하며 화면·엑셀·PDF가 공유합니다.

---

## 폴더 구조

```
app/
  page.tsx                      차량번호 검색 진입
  record/[plate]/page.tsx       편집 화면
  print/[plate]/page.tsx        PDF용 A4 인쇄 페이지
  api/vehicles/...              검색 / 단건 조회
  api/records/...               upsert / resume
  api/photos/route.ts           사진 업로드·삭제
  api/export/xlsx/[plate]/      엑셀 생성
components/                     UI 컴포넌트
lib/
  slots.ts                      슬롯 기본 정의
  export/layout-spec.ts         레이아웃 단일 진실원
  export/xlsx-builder.ts        ExcelJS 생성기
  supabase/{client,server}.ts
scripts/import-vehicles.ts      CSV(CP949) 적재
supabase/schema.sql             DB 스키마
```
