"use client";

import { useState } from "react";

export default function ExportButtons({ plate }: { plate: string }) {
  const [downloading, setDownloading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function downloadXlsx() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/export/xlsx/${encodeURIComponent(plate)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "엑셀 생성 실패");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `B820_설치사진첩_${plate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "엑셀 생성 실패");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const res = await fetch(`/api/export/pdf/${encodeURIComponent(plate)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "PDF 생성 실패");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `B820_설치사진첩_${plate}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      // 서버 PDF 실패 시 인쇄 대화상자 폴백
      if (
        confirm(
          `자동 PDF 생성에 실패했습니다.\n(${e instanceof Error ? e.message : ""})\n인쇄 화면으로 저장할까요?`,
        )
      ) {
        window.open(`/print/${encodeURIComponent(plate)}`, "_blank");
      }
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={downloadXlsx}
        disabled={downloading}
        className="rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white active:bg-green-700 disabled:opacity-50"
      >
        {downloading ? "엑셀 생성 중…" : "엑셀(.xlsx) 다운로드"}
      </button>
      <button
        onClick={downloadPdf}
        disabled={pdfBusy}
        className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-semibold text-white active:bg-rose-700 disabled:opacity-50"
      >
        {pdfBusy ? "PDF 생성 중…" : "PDF 다운로드"}
      </button>
    </div>
  );
}
