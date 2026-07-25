"use client";

import { useState } from "react";
import type { TeamPhone } from "@/lib/settings";

// 홈 화면 설치팀 전화 버튼 (VOC 접수 아래).
// 클릭 시 연락처를 불러와 1건이면 바로 전화, 여러 건이면 팝업에서 선택.
// 연락처는 관리자 페이지 '설치팀 연락처 관리'에서 등록. (app_settings.install_team_phones)
export default function TeamCallButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<TeamPhone[]>([]);

  const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, "")}`;

  async function onClick() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/team-phones", { cache: "no-store" });
      const j = await res.json();
      const list: TeamPhone[] = Array.isArray(j.list) ? j.list : [];
      if (list.length === 1) {
        window.location.href = telHref(list[0].phone);
        return;
      }
      setContacts(list);
      setOpen(true);
    } catch {
      setContacts([]);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="mt-2 rounded-xl border border-green-300 bg-white px-4 py-3 text-center text-sm font-semibold text-green-700 shadow-sm active:bg-green-50"
      >
        {loading ? "연락처 불러오는 중…" : "📞 설치팀 전화"}
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
            {contacts.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                등록된 연락처가 없습니다.
                <br />
                관리자 페이지 → 설치팀 탭에서 추가해 주세요.
              </p>
            ) : (
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
            )}
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
