// 수량 차감 방식 순수 로직(lib/quota.ts) 자체 점검 — DB 없이 실행: npm run check:quota
import assert from "node:assert/strict";
import { nextDateFor, pickSwap } from "../lib/quota";

// 이월 날짜: 오늘 이후 가장 가까운 예정일(오늘 포함), 없으면 null
assert.equal(nextDateFor(["2026-11-04", "2026-11-05", "2026-11-26"], "2026-11-05"), "2026-11-05");
assert.equal(nextDateFor(["2026-11-04", "2026-11-05", "2026-11-26"], "2026-11-06"), "2026-11-26");
assert.equal(nextDateFor(["2026-11-04", "2026-11-05"], "2026-11-06"), null);
assert.equal(nextDateFor([], "2026-11-06"), null);

// 자리 교환 후보: 미착수 차량만, 자기 자신 제외, 차량번호 순
assert.equal(
  pickSwap(
    [
      { plate: "서울71사2339", started: true },
      { plate: "서울70사8201", started: false },
      { plate: "서울70바5559", started: false },
    ],
    "서울71사1955",
  ),
  "서울70바5559",
);
assert.equal(pickSwap([{ plate: "서울70사8201", started: false }], "서울70사8201"), null);
assert.equal(pickSwap([{ plate: "서울70사8201", started: true }], "서울71사1955"), null);

console.log("OK — check-quota");
