"use client";

import { motion } from "framer-motion";
import { useId } from "react";
import { verdictRhythm, vitals, type VitalTone } from "@/lib/analysis/plainEnglish";
import type { ScanResult } from "@/lib/types/scan";

export const VITAL_COLOR: Record<VitalTone, string> = {
  good: "var(--phosphor)",
  watch: "var(--amber)",
  bad: "var(--infra)",
  unknown: "rgba(216,230,242,0.45)",
};

/** One beat: flat, small P wave, sharp QRS spike, T wave. Amplitude 0-1. */
function beat(x: number, w: number, amp: number) {
  const y = (v: number) => (16 - v * 13 * amp).toFixed(1);
  return `L${x + w * 0.18},16 Q${x + w * 0.24},${y(0.18)} ${x + w * 0.3},16 L${x + w * 0.4},16 L${x + w * 0.44},${y(-0.25)} L${x + w * 0.5},${y(1)} L${x + w * 0.56},${y(-0.4)} L${x + w * 0.6},16 L${x + w * 0.7},16 Q${x + w * 0.78},${y(0.3)} ${x + w * 0.86},16 L${x + w},16`;
}

const RHYTHMS: Record<ScanResult["caseFile"]["verdict"]["level"], { widths: number[]; amps: number[]; seconds: number }> = {
  FEW_RED_FLAGS: { widths: [100, 100], amps: [0.9, 0.9], seconds: 3.2 },
  SOME_RED_FLAGS: { widths: [66, 67, 67], amps: [1, 0.85, 1], seconds: 2.4 },
  SERIOUS_RED_FLAGS: { widths: [38, 62, 30, 70], amps: [1, 0.55, 1.15, 0.8], seconds: 1.8 },
  NOT_ENOUGH_DATA: { widths: [100, 100], amps: [0.18, 0.12], seconds: 4.2 },
};

/** Heart-monitor trace whose rhythm follows the verdict. Purely decorative. */
export function VerdictTrace({ level }: { level: ScanResult["caseFile"]["verdict"]["level"] }) {
  const id = useId().replace(/:/g, "");
  const r = RHYTHMS[level];
  const { word, tone } = verdictRhythm(level);
  let x = 0;
  let d = "M0,16";
  for (let i = 0; i < r.widths.length; i++) {
    d += beat(x, r.widths[i], r.amps[i]);
    x += r.widths[i];
  }
  const color = VITAL_COLOR[tone];
  return (
    <div className="mt-3 flex items-center gap-3">
      <svg viewBox="0 0 200 32" preserveAspectRatio="none" className="h-8 flex-1 overflow-hidden" aria-hidden>
        <defs>
          <linearGradient id={`fade-${id}`} x1="0" x2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.25" stopColor="#fff" stopOpacity="1" />
            <stop offset="0.85" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id={`mask-${id}`}>
            <rect width="200" height="32" fill={`url(#fade-${id})`} />
          </mask>
        </defs>
        <line x1="0" x2="200" y1="16" y2="16" stroke="rgba(216,230,242,0.06)" />
        <g mask={`url(#mask-${id})`}>
          <g className="vital-trace" style={{ animationDuration: `${r.seconds}s` }}>
            <path d={d} fill="none" stroke={color} strokeWidth="1.3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
            <path d={d} transform="translate(200 0)" fill="none" stroke={color} strokeWidth="1.3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
          </g>
        </g>
      </svg>
      <span className="w-[74px] text-right font-mono text-[9.5px] tracking-[0.2em]" style={{ color }}>
        {word}
      </span>
    </div>
  );
}

const SCALE: { level: ScanResult["caseFile"]["verdict"]["level"]; label: string }[] = [
  { level: "FEW_RED_FLAGS", label: "FEW" },
  { level: "SOME_RED_FLAGS", label: "SOME" },
  { level: "SERIOUS_RED_FLAGS", label: "SERIOUS" },
];

/** Three-step red flag scale with the verdict lit. */
export function VerdictScale({ level, delay }: { level: ScanResult["caseFile"]["verdict"]["level"]; delay: number }) {
  const at = SCALE.findIndex((s) => s.level === level);
  const color = VITAL_COLOR[verdictRhythm(level).tone];
  return (
    <div className="mt-3" aria-hidden>
      <div className="flex gap-[3px]">
        {SCALE.map((s, i) => (
          <motion.span
            key={s.level}
            className="h-1.5 flex-1"
            initial={{ opacity: 0.1 }}
            animate={{ opacity: i === at ? 1 : i < at ? 0.45 : 0.12 }}
            transition={{ delay: delay + 0.2 + i * 0.12 }}
            style={{ background: i <= at ? color : "var(--bone)" }}
          />
        ))}
      </div>
      <div className="mt-1 flex font-mono text-[8.5px] tracking-[0.2em] text-mute">
        {SCALE.map((s, i) => (
          <span key={s.level} className="flex-1" style={i === at ? { color } : undefined}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** QUICK READ: the questions a buyer asks, each with the scan's answer. */
export function QuickRead({ result, plain, delay }: { result: ScanResult; plain: boolean; delay: number }) {
  const items = vitals(result);
  return (
    <section className="border-b border-white/[0.05] px-5 py-3.5" aria-label="Quick read">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] tracking-[0.24em] text-phosphor/90">QUICK READ</span>
        <span className="font-mono text-[9.5px] tracking-[0.16em] text-mute">{items.filter((v) => v.tone === "bad" || v.tone === "watch").length} TO WATCH</span>
      </div>
      <ul className="mt-2.5 space-y-2.5">
        {items.map((v, i) => (
          <motion.li
            key={v.key}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: delay + 0.5 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                {v.tone === "bad" && <span className="absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping" style={{ background: VITAL_COLOR.bad }} />}
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: VITAL_COLOR[v.tone] }} />
              </span>
              <span className="flex-1 text-[12.5px] leading-snug text-bone/85">{v.question}</span>
              <span className="font-mono text-[10.5px] tracking-[0.12em]" style={{ color: VITAL_COLOR[v.tone] }}>
                {v.answer}
              </span>
            </div>
            {plain && <p className="mt-0.5 pl-[18px] text-[11.5px] leading-snug text-bone/50">{v.detail}</p>}
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
