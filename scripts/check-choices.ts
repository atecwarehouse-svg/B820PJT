// 1단계 선택 확인 항목(lib/check-choices.ts) 자체 점검 — DB 없이 실행: npx tsx scripts/check-choices.ts
import assert from "node:assert/strict";
import { B800_CHOICES as D, choicesMissing, readChoices, writeChoice } from "../lib/check-choices";

// 처음엔 전부 미선택
assert.match(choicesMissing(D, readChoices(D, "", []))!, /TV소리.*Y\/N\/TV없음/);

// TV Y → 비고 '없음' 대체
let r = writeChoice(D, "없음", [], "tv", { v: "Y", detail: "" });
assert.equal(r.note, "TV소리 나옴");
// TV Y→N 교체, 손으로 쓴 줄 유지
r = writeChoice(D, "TV소리 나옴\n전광판 깨짐", [], "tv", { v: "N", detail: "" });
assert.equal(r.note, "TV소리 안나옴\n전광판 깨짐");
// TV없음 → 문구 없이 na 키, 비고는 그대로
r = writeChoice(D, "없음", [], "tv", { v: "none", detail: "" });
assert.deepEqual(r, { note: "없음", na: ["check_tv"] });
assert.equal(readChoices(D, r.note, r.na).tv?.v, "none");
// 다시 Y면 na 키 제거
r = writeChoice(D, r.note, r.na, "tv", { v: "Y", detail: "" });
assert.deepEqual(r, { note: "TV소리 나옴", na: [] });

// 라디오·파손 — 항목 순서대로 맨 위에 쌓인다
r = writeChoice(D, r.note, r.na, "damage", { v: "N", detail: "" });
r = writeChoice(D, r.note, r.na, "radio", { v: "Y", detail: "" });
assert.equal(r.note, "TV소리 나옴\n라디오 정상(D-SPK·P-SPK)\n차량파손 없음");
assert.equal(choicesMissing(D, readChoices(D, r.note, r.na)), null);

// 파손 Y는 부위 입력 전까지 누락, 입력하면 문구에 붙는다
r = writeChoice(D, r.note, r.na, "damage", { v: "Y", detail: "" });
assert.equal(choicesMissing(D, readChoices(D, r.note, r.na)), "차량파손 부위를 입력해주세요");
r = writeChoice(D, r.note, r.na, "damage", { v: "Y", detail: "앞범퍼 긁힘" });
assert.equal(r.note.split("\n")[2], "차량파손 부위: 앞범퍼 긁힘");
assert.equal(readChoices(D, r.note, r.na).damage?.detail, "앞범퍼 긁힘");
assert.equal(choicesMissing(D, readChoices(D, r.note, r.na)), null);
// 문구를 손으로 지우면 다시 미선택
assert.match(choicesMissing(D, readChoices(D, "TV소리 나옴\n차량파손 없음", []))!, /라디오/);

console.log("OK — check-choices");
