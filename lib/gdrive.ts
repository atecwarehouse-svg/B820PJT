// Google Drive 사진 저장소 헬퍼 — 서버 전용.
// OAuth 2.0(리프레시 토큰) + drive.file 스코프로 앱이 만든 파일만 접근.
// 업로드/다운로드/삭제만 수행. 화면 표시는 /api/photo/[id] 프록시(lib/photo-url.ts) 사용.

import { google } from "googleapis";
import { Readable } from "node:stream";

// drive.file: 이 앱이 생성/열람한 파일에만 접근 (검증 불필요한 비민감 스코프).
export const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

function oauthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google 환경변수 누락: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN",
    );
  }
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

type Drive = ReturnType<typeof google.drive>;

function drive(): Drive {
  return google.drive({ version: "v3", auth: oauthClient() });
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

function rootFolderId(): string {
  const id = process.env.GDRIVE_FOLDER_ID;
  if (!id) throw new Error("GDRIVE_FOLDER_ID 환경변수 누락");
  return id;
}

function isNotFound(e: unknown): boolean {
  const code = (e as { code?: number; status?: number })?.code ?? (e as { status?: number })?.status;
  return code === 404;
}

// 부모 폴더 안에서 이름이 일치하는 하위 폴더를 찾고, 없으면 만든다.
// (drive.file 스코프 — 앱이 만든 폴더만 검색/생성 가능)
async function ensureFolder(d: Drive, name: string, parentId: string): Promise<string> {
  const safe = name.replace(/['\\]/g, "\\$&"); // 쿼리 인젝션 방지(따옴표 이스케이프)
  const res = await d.files.list({
    q: `mimeType='${FOLDER_MIME}' and name='${safe}' and '${parentId}' in parents and trashed=false`,
    fields: "files(id)",
    spaces: "drive",
    pageSize: 1,
  });
  const found = res.data.files?.[0]?.id;
  if (found) return found;

  const created = await d.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: "id",
  });
  if (!created.data.id) throw new Error(`폴더 생성 실패: ${name}`);
  return created.data.id;
}

// 업로드. 경로: 루트(GDRIVE_FOLDER_ID) / 운수사 / 차량번호 / {fileName}
// 항상 '새 파일'을 만들고 그 Drive 파일 ID를 반환한다. (기존 파일 삭제는 호출부가
// DB 저장 성공을 확인한 뒤 deletePhoto로 수행 — 부분 실패로 인한 깨짐/고아 방지)
export async function uploadPhoto(opts: {
  plate: string;
  operator: string;
  fileName: string; // 저장 파일명 (확장자 포함). 예: 설치전_인천70바1273_GPS안테나.jpg
  body: Buffer;
  contentType?: string;
}): Promise<string> {
  const { plate, operator, fileName, body, contentType = "image/jpeg" } = opts;
  const d = drive();
  const media = { mimeType: contentType, body: Readable.from(body) };

  const operatorFolder = await ensureFolder(d, operator || "미지정", rootFolderId());
  const plateFolder = await ensureFolder(d, plate, operatorFolder);
  const res = await d.files.create({
    requestBody: { name: fileName, parents: [plateFolder] },
    media,
    fields: "id",
  });
  const newId = res.data.id;
  if (!newId) throw new Error("Google Drive 업로드 실패: 파일 ID 없음");
  return newId;
}

export async function downloadPhoto(fileId: string): Promise<Buffer> {
  const res = await drive().files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export async function deletePhoto(fileId: string): Promise<void> {
  try {
    await drive().files.delete({ fileId });
  } catch (e) {
    if (!isNotFound(e)) throw e; // 이미 없으면 무시
  }
}
