// 수량 차감 방식 순수 로직(lib/quota.ts) 자체 점검 — DB 없이 실행: npm run check:quota
import assert from "node:assert/strict";
import { nextDateFor, pickSwap, swapOrder } from "../lib/quota";

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

// 같은 운수사 미착수 차량이 먼저, 없으면 다른 운수사 미착수 차량과 교환(금일 대상 수량 유지 — 11/13 20대→25대 재발 방지)
assert.equal(
  pickSwap(
    [
      { plate: "서울70사8233", started: false, sameOp: false },
      { plate: "서울71사2382", started: false, sameOp: true },
    ],
    "서울71사2410",
  ),
  "서울71사2382",
);
assert.equal(
  pickSwap(
    [
      { plate: "서울71사2341", started: true, sameOp: true },
      { plate: "서울70사8234", started: false, sameOp: false },
      { plate: "서울70사8233", started: false, sameOp: false },
    ],
    "서울71사2410",
  ),
  "서울70사8233",
);

// 후보 순서 — 같은 운수사 전부, 그다음 다른 영업소(첫 후보를 다른 요청이 가져가면 다음 후보로 넘어간다)
assert.deepEqual(
  swapOrder(
    [
      { plate: "서울70사8234", started: false, sameOp: false },
      { plate: "서울71사2384", started: false, sameOp: true },
      { plate: "서울70사8233", started: false, sameOp: false },
      { plate: "서울71사2341", started: true, sameOp: true },
    ],
    "서울71사2410",
  ),
  ["서울71사2384", "서울70사8233", "서울70사8234"],
);

// 교환은 내 예정일이 미래일 때만 — 과거 날짜 비교 규칙(settleQuota의 cur > today 가드와 동일 문자열 비교)
assert.ok("2026-11-16" > "2026-11-13" && !("2026-11-08" > "2026-11-09"));

console.log("OK — check-quota");
