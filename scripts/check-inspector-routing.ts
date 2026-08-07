// 검수자별 알림 라우팅 자체 검증 — DB·네트워크 없이 순수 로직만 확인.
//   npx tsx scripts/check-inspector-routing.ts
//
// 지키려는 것 2가지:
//  1) 설치시작 보고 저장값의 구버전(운수사 배열) 호환 — 잘못 읽으면 그날 보고 잠금이 통째로 풀린다.
//  2) TEAMS_INSPECTOR_WEBHOOKS 파싱이 어떤 쓰레기 값에도 throw하지 않음 — 던지면 대시보드가 500.

import assert from "node:assert/strict";
import { parseStartReport } from "../lib/settings";

// 1) 저장값 파싱 — 결과는 프로토타입 없는 객체라 비교 전에 일반 객체로 펼친다
const parsed = (raw: string | null) => ({ ...parseStartReport(raw) });

assert.deepEqual(parsed(null), {}, "미설정 → 빈 객체");
assert.deepEqual(
  parsed('["삼환교통","선진여객"]'),
  { 삼환교통: [], 선진여객: [] },
  "구버전 배열 → 운수사 잠금 유지(담당자 없음)",
);
assert.deepEqual(
  parsed('{"삼환교통":["김준영","황문환"],"선진여객":["김기훈"]}'),
  { 삼환교통: ["김준영", "황문환"], 선진여객: ["김기훈"] },
  "신버전 객체 → 그대로",
);
assert.deepEqual(parsed('{"삼환교통":null}'), { 삼환교통: [] }, "담당자 값 이상 → 빈 배열");
assert.deepEqual(parsed("깨진 JSON"), {}, "파싱 실패 → 빈 객체(throw 금지)");

// 운수사명이 키라서 프로토타입 속성명과 부딪히면 안 된다
// (일반 객체면 "toString" in map === true → 보고 안 한 곳이 보고된 것으로 판정되고,
//  map["constructor"]가 함수로 나와 담당자 조회가 깨진다)
{
  const m = parseStartReport('{"삼환교통":["김준영"]}');
  assert.equal("toString" in m, false, "없는 키는 in 으로도 안 잡혀야 함");
  assert.equal("constructor" in m, false, "constructor 도 마찬가지");
  assert.equal(m["constructor"], undefined, "프로토타입 함수가 담당자로 새면 안 됨");
  assert.equal("삼환교통" in m, true, "실제 운수사는 정상 조회");
  assert.equal(JSON.stringify(m), '{"삼환교통":["김준영"]}', "저장 형식은 그대로");
}

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
