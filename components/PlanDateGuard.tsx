"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { weekdayLabel } from "@/lib/work-day";

// 금일(업무일) 설치 대상이 아닌 차량의 촬영 페이지 진입 시 경고 팝업.
// 차량번호 오입력 방지용 — 뒤로가기(기본) 또는 그래도 진행(어제 미완료 이어하기 등) 선택.
export default function PlanDateGuard({
  plate,
  plannedDate,
}: {
  plate: string;
  plannedDate: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-xl">
        <p className="text-3xl">⚠️</p>
        <p className="mt-2 text-lg font-bold text-red-600">
          금일 설치 대상 차량이 아닙니다
        </p>
        <p className="mt-3 rounded-lg bg-gray-50 py-2 text-base font-semibold">{plate}</p>
        <p className="mt-2 text-sm text-gray-600">
          설치 예정일:{" "}
          {plannedDate ? `${plannedDate} ${weekdayLabel(plannedDate)}` : "없음"}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          차량번호를 잘못 입력하지 않았는지 확인해주세요.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => router.back()}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white active:bg-blue-700"
          >
            ← 뒤로가기 (차량번호 다시 입력)
          </button>
          <button
            onClick={() => setOpen(false)}
            className="w-full rounded-xl bg-gray-100 px-4 py-3 text-sm font-medium text-gray-600 active:bg-gray-200"
          >
            맞는 차량입니다 — 계속 진행
          </button>
        </div>
      </div>
    </div>
  );
}
