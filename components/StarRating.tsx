"use client";

import { VOC_MAX_STARS } from "@/lib/voc";

// 5점 만점 별점 입력. 같은 별을 다시 누르면 해제(미평가)된다.
// 터치 화면에서 누르기 쉽도록 별을 크게 잡았다.
export default function StarRating({
  value,
  onChange,
  label,
  disabled,
}: {
  value?: number;
  onChange: (v: number | undefined) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-gray-600">{label}</span>
      <div className="flex shrink-0 items-center gap-0.5">
        {Array.from({ length: VOC_MAX_STARS }, (_, i) => i + 1).map((n) => {
          const on = (value ?? 0) >= n;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              aria-label={`${label} ${n}점`}
              onClick={() => onChange(value === n ? undefined : n)}
              className={`px-0.5 text-xl leading-none transition-colors disabled:opacity-40 ${
                on ? "text-amber-400" : "text-gray-300"
              }`}
            >
              ★
            </button>
          );
        })}
        <span className="ml-1 w-6 text-right text-[11px] tabular-nums text-gray-400">
          {value ? `${value}점` : "-"}
        </span>
      </div>
    </div>
  );
}
