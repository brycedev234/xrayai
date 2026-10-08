"use client";

import { useEffect, useRef } from "react";
import { useInViewport } from "@/hooks/useInViewport";

export type DrawFn = (ctx: CanvasRenderingContext2D, t: number, w: number, h: number) => void;

interface Props {
  draw: DrawFn;
  className?: string;
  onPointerMove?: (x: number, y: number, w: number, h: number) => void;
  onPointerLeave?: () => void;
  label?: string;
}

/**
 * Canvas that sizes itself to its box, handles device pixel ratio and only
 * animates while on screen. `draw` receives CSS-pixel dimensions.
 */
export function LiveCanvas({ draw, className = "", onPointerMove, onPointerLeave, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const visible = useInViewport(ref);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const start = useRef(typeof performance !== "undefined" ? performance.now() : 0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ro = new ResizeObserver(([e]) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = e.contentRect.width;
      const h = e.contentRect.height;
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    const frame = () => {
      const { w, h, dpr } = sizeRef.current;
      if (w > 0 && h > 0) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        drawRef.current(ctx, (performance.now() - start.current) / 1000, w, h);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  return (
    <canvas
      ref={ref}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`block h-full w-full ${className}`}
      onPointerMove={
        onPointerMove
          ? (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onPointerMove(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
            }
          : undefined
      }
      onPointerLeave={onPointerLeave}
    />
  );
}
