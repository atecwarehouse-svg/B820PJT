// 검수자별 알림 라우팅 자체 검증 — DB·네트워크 없이 순수 로직만 확인.
//   npx tsx scripts/check-inspector-routing.ts
//
// 지키려는 것 2가지:
//  1) 설치시작 보고 저장값의 구버전(운수사 배열) 호환 — 잘못 읽으면 그날 보고 잠금이 통째로 풀린다.
//  2) TEAMS_INSPECTOR_WEBHOOKS 파싱이 어떤 쓰레기 값에도 throw하지 않음 — 던지면 대시보드가 500.

import assert from "node:assert/strict";
import { parseStartReport } from "../lib/settings";

// 1) 저장값 파싱
assert.deepEqual(parseStartReport(null), {}, "미설정 → 빈 객체");
assert.deepEqual(
  parseStartReport('["삼환교통","선진여객"]'),
  { 삼환교통: [], 선진여객: [] },
  "구버전 배열 → 운수사 잠금 유지(담당자 없음)",
);
assert.deepEqual(
  parseStartReport('{"삼환교통":["김준영","황문환"],"선진여객":["김기훈"]}'),
  { 삼환교통: ["김준영", "황문환"], 선진여객: ["김기훈"] },
  "신버전 객체 → 그대로",
);
assert.deepEqual(parseStartReport('{"삼환교통":null}'), { 삼환교통: [] }, "담당자 값 이상 → 빈 배열");
assert.deepEqual(parseStartReport("깨진 JSON"), {}, "파싱 실패 → 빈 객체(throw 금지)");

// 2) 웹훅 파싱 — env를 세팅한 뒤에 import해야 모듈이 현재 값을 읽는다
async function checkWebhooks() {
  const { inspectorNames } = await import("../lib/teams");
  const set = (v: string | undefined) => {
    if (v === undefined) delete process.env.TEAMS_INSPECTOR_WEBHOOKS;
    else process.env.TEAMS_INSPECTOR_WEBHOOKS = v;
  };

  set(undefined);
  assert.deepEqual(inspectorNames(), [], "미설정 → 이름 없음(담당 버튼 미노출)");

  set("이건 JSON이 아님");
  assert.deepEqual(inspectorNames(), [], "깨진 JSON → 빈 배열(throw 금지)");

  set('["김준영"]');
  assert.deepEqual(inspectorNames(), [], "배열 형태 오입력 → 빈 배열");

  set('{"김준영":"https://a.example/x"," 황문환 ":"https://b.example/y","김기훈":"http://insecure","이경호":123}');
  assert.deepEqual(
    inspectorNames(),
    ["김준영", "황문환"],
    "https URL만 채택 · 이름 공백 제거 · 값이 문자열이 아니면 제외",
  );
}

checkWebhooks().then(() => console.log("✅ 검수자 라우팅 로직 검증 통과"));
