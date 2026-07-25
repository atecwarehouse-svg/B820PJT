"use client";

import { useState } from "react";
import type { TeamPhone } from "@/lib/settings";

// 저장 목록 상단 설치팀 전화 버튼.
// 연락처 1건이면 바로 전화, 여러 건이면 팝업에서 선택해 전화.
export default function TeamCallButton({ contacts }: { contacts: TeamPhone[] }) {
  const [open, setOpen] = useState(false);
  if (contacts.length === 0) return null;

  const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, "")}`;

  if (contacts.length === 1) {
    return (
      <a
        href={telHref(contacts[0].phone)}
        className="inline-flex items-center gap-1 rounded-full bg-green-600 px-3 py-1.5 text-xs font-semibold text-white active:bg-green-700"
      >
        📞 설치팀 전화
      </a>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full bg-green-600 px-3 py-1.5 text-xs font-semibold text-white active:bg-green-700"
      >
        📞 설치팀 전화
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-white p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-center text-sm font-bold text-gray-800">
              설치팀 전화
            </h3>
            <ul className="space-y-2">
              {contacts.map((c, i) => (
                <li key={i}>
                  <a
                    href={telHref(c.phone)}
                    className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 active:bg-green-50"
                  >
                    <span className="text-sm font-semibold text-gray-800">{c.name}</span>
                    <span className="text-sm text-green-600">📞 {c.phone}</span>
                  </a>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setOpen(false)}
              className="mt-3 w-full rounded-xl bg-gray-100 py-2.5 text-sm font-medium text-gray-600 active:bg-gray-200"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
