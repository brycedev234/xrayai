"use client";

import { useMemo, type ReactNode } from "react";
import type { Specimen } from "@/lib/demo/specimenTypes";
import { buildLayout, type SpecimenLayout } from "../xray/layout";
import { createParticles, drawIngest, drawSpecimen, type FocusKey } from "../xray/renderer";
import { LiveCanvas } from "./LiveCanvas";

export interface BodyView {
  cx: number;
  cy: number;
  zoom: number;
}

export const FULL_VIEW: BodyView = { cx: 500, cy: 520, zoom: 1 };

/** SVG viewBox matching a square crop of the 1000×1000 anatomy space. */
export function viewBoxFor(v: BodyView): string {
  const half = 500 / v.zoom;
  return `${v.cx - half} ${v.cy - half} ${half * 2} ${half * 2}`;
}

export interface BodyFrame {
  mode: "ingest" | "specimen";
  focus?: FocusKey;
  /** Reveal clock for the assembly (seconds); omit for fully revealed. */
  revealT?: number;
  /** Seconds since ingest began (ingest mode only). */
  ingestT?: number;
}

interface Props {
  scan: Specimen;
  view?: BodyView;
  /** Called every frame with the animation clock; returns what to draw. */
  frame: (t: number) => BodyFrame;
  reducedMotion?: boolean;
  label?: string;
  children?: (layout: SpecimenLayout) => ReactNode;
  className?: string;
}

/** The anatomical token body, drawable whole or as a zoomed crop around one organ. */
export function TokenBody({ scan, view = FULL_VIEW, frame, reducedMotion = false, label, children, className = "" }: Props) {
  const layout = useMemo(() => buildLayout(scan), [scan]);
  const particles = useMemo(() => createParticles(scan), [scan]);

  return (
    <div className={`relative aspect-square w-full ${className}`}>
      <LiveCanvas
        label={label}
        draw={(ctx, t, w, h) => {
          const size = Math.min(w, h);
          const s = (size / 1000) * view.zoom;
          ctx.translate(w / 2, h / 2);
          ctx.scale(s, s);
          ctx.translate(-view.cx, -view.cy);
          const f = frame(t);
          if (f.mode === "ingest") drawIngest(ctx, f.ingestT ?? t, layout, reducedMotion);
          else
            drawSpecimen(
              ctx,
              t,
              { scan, layout, focus: f.focus ?? null, hoveredCell: null, reducedMotion, revealT: f.revealT ?? 99, idleSweep: false },
              particles,
            );
        }}
      />
      {children && <div className="pointer-events-none absolute inset-0">{children(layout)}</div>}
    </div>
  );
}
