// 수량 차감 방식 순수 로직(lib/quota.ts) 자체 점검 — DB 없이 실행: npm run check:quota
import assert from "node:assert/strict";
import { countPlan, mergePlan, nextDateFor, pickSwap, shiftPlan, swapOrder } from "../lib/quota";
import { buildReport, serviceCheckRows } from "../lib/report";

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

// ── 원본 계획(누적 계획이 실적을 따라 바뀌던 문제 — 11/13 계획 20대인데 22대 설치) ──
assert.deepEqual(countPlan(["2026-11-13", "2026-11-13T00:00:00", null, "2026-11-16"]), { "2026-11-13": 2, "2026-11-16": 1 });
// 재업로드: 지난 날짜는 이전 보관값, 오늘 이후는 파일
assert.deepEqual(
  mergePlan({ "2026-11-13": 20, "2026-11-16": 27 }, { "2026-11-13": 22, "2026-11-16": 25, "2026-11-17": 30 }, "2026-11-14"),
  { "2026-11-13": 20, "2026-11-16": 25, "2026-11-17": 30 },
);
assert.deepEqual(mergePlan(null, { "2026-11-13": 22 }, "2026-11-14"), { "2026-11-13": 22 });
// 설치 일정변경: 옮긴 만큼만, 같은 날짜로는 변화 없음, 0대가 된 날짜는 지움
assert.deepEqual(
  shiftPlan({ "2026-11-16": 2, "2026-11-17": 1 }, ["2026-11-16", "2026-11-17", "2026-11-18", null], "2026-11-18"),
  { "2026-11-16": 1, "2026-11-18": 3 },
);
// 리포트 금일·누적 계획은 원본 계획 기준(예정일 대수 22대는 실적이 덮은 값)
{
  const r = buildReport({
    date: "2026-11-13",
    completedList: [],
    scheduleDays: [{ date: "2026-11-05", planned: 8 }, { date: "2026-11-13", planned: 22 }],
    planDays: [{ date: "2026-11-05", planned: 8 }, { date: "2026-11-13", planned: 20 }, { date: "2026-11-16", planned: 27 }],
  });
  assert.equal(r.cumPlanned, 28);
  assert.equal(r.dailyPlanned, 20);
}
// 승무사원 교육: 예정(고정 문구) / 완료 선택
assert.equal(serviceCheckRows({ driverEduNote: "3:30 교육 예정" })[0].value, "🕒 3:30 교육 예정");
assert.equal(serviceCheckRows({ driverEdu: true })[0].value, "✅ 교육완료");

console.log("OK — check-quota");
