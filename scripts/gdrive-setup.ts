// Google Drive 1회 설정 스크립트.
//   1) 브라우저로 구글 로그인 → 권한 동의 → 리프레시 토큰 발급
//   2) 사진 저장용 폴더 자동 생성 → 폴더 ID 출력
//
// 실행: npm run gdrive:setup
// 사전 준비: .env.local 에 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 입력
//           (Google Cloud Console > 사용자 인증 정보 > OAuth 클라이언트 ID,
//            유형 "데스크톱 앱"으로 만들면 시크릿까지 한 번에 발급됨)
//
// 출력된 GOOGLE_REFRESH_TOKEN / GDRIVE_FOLDER_ID 를 .env.local(과 Vercel)에 넣으세요.

import { config as loadEnv } from "dotenv";
import http from "node:http";
import { spawn } from "node:child_process";
import { google } from "googleapis";

// .env.local 우선, 없으면 .env
loadEnv({ path: ".env.local" });
loadEnv();

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const PORT = 53682; // 로컬 콜백 포트(임시 서버)
const REDIRECT = `http://localhost:${PORT}`;
const FOLDER_NAME = process.env.GDRIVE_FOLDER_NAME || "B820 설치사진";

function fail(msg: string): never {
  console.error("\n[오류] " + msg);
  process.exit(1);
}

// 기본 브라우저로 URL 자동 열기 (긴 주소 복사 중 잘림 방지)
function openBrowser(url: string) {
  try {
    if (process.platform === "win32") {
      spawn("powershell", ["-NoProfile", "-Command", `Start-Process '${url}'`], {
        detached: true,
        stdio: "ignore",
      }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    // 자동 열기 실패해도 아래에 주소를 출력하므로 수동으로 진행 가능
  }
}

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    fail(".env.local 에 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 를 먼저 넣어주세요.");
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT);
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // 항상 리프레시 토큰 재발급
    scope: [SCOPE],
  });

  // 콜백을 받을 임시 로컬 서버
  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "", REDIRECT);
      const c = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<h2>완료되었습니다. 이 창을 닫고 터미널로 돌아가세요.</h2>",
      );
      server.close();
      if (err) return reject(new Error("동의 거부됨: " + err));
      if (!c) return reject(new Error("인증 코드를 받지 못했습니다."));
      resolve(c);
    });
    server.listen(PORT, () => {
      console.log("\n브라우저를 자동으로 엽니다. 구글 로그인 & 동의를 진행하세요.");
      console.log("('확인되지 않은 앱' 경고가 나오면 고급 > 계속 진행을 누르세요.)\n");
      console.log("자동으로 안 열리면, 아래 주소 '전체'를 복사해 브라우저에 붙여넣으세요:\n");
      console.log(authUrl + "\n");
      openBrowser(authUrl);
    });
    server.on("error", reject);
  });

  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    fail(
      "리프레시 토큰이 없습니다. Google 계정 > 보안 > 타사 앱에서 기존 권한을 제거한 뒤 다시 실행하세요.",
    );
  }
  oauth2.setCredentials(tokens);

  // 사진 저장 폴더 생성
  const drive = google.drive({ version: "v3", auth: oauth2 });
  const folder = await drive.files.create({
    requestBody: {
      name: FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id, name",
  });

  console.log("\n========= 설정 완료 — 아래 두 값을 .env.local 과 Vercel 에 넣으세요 =========\n");
  console.log("GOOGLE_REFRESH_TOKEN=" + tokens.refresh_token);
  console.log("GDRIVE_FOLDER_ID=" + folder.data.id);
  console.log("\n(폴더 \"" + folder.data.name + "\" 가 내 드라이브에 생성되었습니다.)");
  console.log("========================================================================\n");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
