# B820 설치 사진첩 웹앱

인천 B820 버스 장비 설치 전/후 사진을 **휴대폰(iOS·Android)으로 촬영해 업로드**하면,
원본 엑셀 양식(`B800 설치 사진첩`)과 동일한 레이아웃의 사진첩을 차량별로 생성하고
**엑셀(.xlsx)·PDF로 다운로드**하는 웹앱입니다.

- 차량번호 입력 → 운수사·노선 자동 입력 (차량리스트 2,700여 대)
- 연식·차종은 직접 입력/수정
- 설치 전 항목(칸)은 자유롭게 추가 가능 → 엑셀/PDF에도 자동 반영
- 인증 없음 (URL만 알면 접속/업로드)

## 기술 스택
Next.js(App Router) · Supabase(Postgres + Storage) · ExcelJS · browser-image-compression · GitHub → Vercel

---

## 1. Supabase 준비

1. [supabase.com](https://supabase.com) 에서 새 프로젝트 생성
2. **SQL Editor** 에 `supabase/schema.sql` 전체를 붙여넣고 실행
   - 테이블(vehicles/records/photos) + RLS + `photos` Storage 버킷이 생성됩니다
3. **Settings → API** 에서 아래 값 복사
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` 키 → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` 키 → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ 비공개, 서버 전용)

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
3. **Environment Variables** 에 3개 키 등록
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
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
5. 하단 **엑셀(.xlsx) 다운로드** / **PDF 다운로드**

> **PDF는 버튼 한 번에 서버에서 생성되어 바로 다운로드**됩니다 (headless Chromium).
> - 로컬 개발: 설치된 **Chrome**(없으면 Edge)을 자동 사용합니다.
> - Vercel: `@sparticuz/chromium` 번들을 사용합니다.
> - 서버 생성 실패 시, 인쇄 대화상자(`/print`)로 저장하는 폴백이 자동 제공됩니다.

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
