"use client";

import { useEffect, useImperativeHandle, useRef, forwardRef, useState } from "react";

// 순수 canvas 터치/마우스 서명패드 (외부 라이브러리 없음).
// - Pointer 이벤트로 마우스/펜/터치 모두 지원, touch-action:none 으로 스크롤 방지.
// - 고DPI(devicePixelRatio) 대응해 선명하게 그린다.
// - ref.getDataUrl(): 서명이 있으면 PNG data URL, 비어있으면 null 반환.

export interface SignaturePadHandle {
  clear: () => void;
  getDataUrl: () => string | null;
  isEmpty: () => boolean;
}

const SignaturePad = forwardRef<SignaturePadHandle, { height?: number }>(
  function SignaturePad({ height = 180 }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const dirty = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const [empty, setEmpty] = useState(true);

    // 캔버스를 컨테이너 폭에 맞춰 고DPI로 초기화
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const setup = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#111";
      };
      setup();
      window.addEventListener("resize", setup);
      return () => window.removeEventListener("resize", setup);
    }, []);

    function pos(e: React.PointerEvent<HTMLCanvasElement>) {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function start(e: React.PointerEvent<HTMLCanvasElement>) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drawing.current = true;
      last.current = pos(e);
    }

    function move(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawing.current) return;
      e.preventDefault();
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx || !last.current) return;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
      if (!dirty.current) {
        dirty.current = true;
        setEmpty(false);
      }
    }

    function end(e: React.PointerEvent<HTMLCanvasElement>) {
      drawing.current = false;
      last.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }

    function clear() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty.current = false;
      setEmpty(true);
    }

    useImperativeHandle(ref, () => ({
      clear,
      isEmpty: () => !dirty.current,
      getDataUrl: () =>
        dirty.current ? (canvasRef.current?.toDataURL("image/png") ?? null) : null,
    }));

    return (
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          style={{ height, touchAction: "none" }}
          className="w-full rounded-xl border-2 border-dashed border-gray-300 bg-white"
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-300">
            여기에 손가락으로 서명하세요
          </span>
        )}
        <button
          type="button"
          onClick={clear}
          className="absolute bottom-2 right-2 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-500 active:bg-gray-200"
        >
          지우기
        </button>
      </div>
    );
  },
);

export default SignaturePad;
