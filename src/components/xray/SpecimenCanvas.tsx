"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Specimen } from "@/lib/demo/specimenTypes";
import type { SpecimenLayout } from "./layout";
import { createParticles, drawSpecimen, hitCell, type FocusKey } from "./renderer";

interface Props {
  scan: Specimen;
  layout: SpecimenLayout;
  size: number;
  focus: FocusKey;
  hoveredCell: string | null;
  onCellHover: (address: string | null, pos: { x: number; y: number } | null) => void;
  reducedMotion: boolean;
  /** Shared clock origin (performance.now() ms) so canvas and SVG reveal in sync. */
  startedAt: number;
}

export function SpecimenCanvas({ scan, layout, size, focus, hoveredCell, onCellHover, reducedMotion, startedAt }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useMemo(() => createParticles(scan), [scan]);
  const stateRef = useRef({ scan, layout, focus, hoveredCell, reducedMotion });
  stateRef.current = { scan, layout, focus, hoveredCell, reducedMotion };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const frame = () => {
      const t = (performance.now() - startedAt) / 1000;
      ctx.setTransform((size * dpr) / 1000, 0, 0, (size * dpr) / 1000, 0, 0);
      drawSpecimen(ctx, t, stateRef.current, particles);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size, particles, startedAt]);

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = { x: ((e.clientX - rect.left) / rect.width) * 1000, y: ((e.clientY - rect.top) / rect.height) * 1000 };
    const t = (performance.now() - startedAt) / 1000;
    const hit = hitCell(layout, p, reducedMotion ? 0 : t);
    onCellHover(hit, hit ? p : null);
  };

  return (
    <canvas
      ref={canvasRef}
      aria-label={`X-ray visualization of ${scan.raw.meta.symbol}`}
      role="img"
      onPointerMove={handleMove}
      onPointerLeave={() => onCellHover(null, null)}
      className="absolute inset-0 h-full w-full"
    />
  );
}
