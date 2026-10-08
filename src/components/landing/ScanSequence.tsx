"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { shortAddress } from "@/lib/format";

export const SCAN_STAGES = [
  "INITIALIZING RADIOGRAPHY",
  "VALIDATING TOKEN",
  "READING GENOME",
  "MEASURING LIQUIDITY",
  "MAPPING HOLDERS",
  "TRACING CAPITAL",
  "BUILDING WALLET GRAPH",
  "DETECTING RELATIONSHIPS",
  "GENERATING CASE FILE",
] as const;

const GRAPH_STAGE = 6;
/** Stages that need Helius; marked "not configured" when the result has no wallet graph. */
const DEEP_STAGES = new Set([6, 7]);
const STEP_MS = 430;
const FINISH_STEP_MS = 170;

interface Props {
  address: string;
  /** "running" while the backend works; "done" once a result is in hand. */
  status: "running" | "done";
  /** Result came back without the deep wallet graph (base mode). */
  baseOnly: boolean;
  demo: boolean;
  onComplete: () => void;
}

/**
 * Full-screen scanner. Stages advance on a clock up to BUILDING WALLET GRAPH
 * and hold there until the backend answers; nothing is marked complete before
 * the data exists. Once done, the remaining stages finish quickly.
 */
export function ScanSequence({ address, status, baseOnly, demo, onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [final, setFinal] = useState(false);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    if (final) return;
    const ceiling = status === "done" ? SCAN_STAGES.length : GRAPH_STAGE + 1;
    if (step >= ceiling) {
      if (status === "done") setFinal(true);
      return;
    }
    const id = setTimeout(() => setStep((s) => s + 1), status === "done" ? FINISH_STEP_MS : STEP_MS);
    return () => clearTimeout(id);
  }, [step, status, final]);

  useEffect(() => {
    if (!final) return;
    const id = setTimeout(() => completeRef.current(), baseOnly ? 1500 : 650);
    return () => clearTimeout(id);
  }, [final, baseOnly]);

  const waiting = status === "running" && step >= GRAPH_STAGE + 1;
  const current = SCAN_STAGES[Math.min(SCAN_STAGES.length - 1, step - 1)];

  return (
    <motion.div
      className="fixed inset-0 z-[60] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      aria-live="polite"
      role="status"
    >
      <motion.div
        className="absolute inset-0 bg-[var(--film-950)]"
        initial={{ clipPath: "inset(0 0 100% 0)" }}
        animate={{ clipPath: "inset(0 0 0% 0)" }}
        transition={{ duration: 1.1, ease: [0.7, 0, 0.3, 1] }}
      />
      <motion.div
        className="scan-beam"
        initial={{ top: "-2%" }}
        animate={{ top: ["-2%", "100%", "30%", "62%", "48%"] }}
        transition={{ duration: 2.6, times: [0, 0.42, 0.66, 0.85, 1], ease: "easeInOut", repeat: final ? 0 : Infinity, repeatType: "mirror" }}
      />

      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div className="text-center">
          {final ? (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-[11px] tracking-scan">
              <div className="text-phosphor">{baseOnly ? "BASE RADIOGRAPHY COMPLETE" : demo ? "DEMO RADIOGRAPHY COMPLETE" : "RADIOGRAPH COMPLETE"}</div>
              {baseOnly && <div className="mt-2 text-mute">DEEP WALLET ANALYSIS NOT AVAILABLE · HELIUS NOT CONFIGURED</div>}
            </motion.div>
          ) : (
            <motion.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-mono text-[11px] tracking-scan text-phosphor">
              {current}
              {waiting && <span className="blink"> …</span>}
            </motion.div>
          )}
          <div className="mt-3 font-mono text-[15px] text-bone">{shortAddress(address, 8, 8)}</div>
          {demo && <div className="mt-2 font-mono text-[10px] tracking-[0.2em] text-mute">SAMPLE · SIMULATED FEED</div>}
        </div>
      </div>

      <div className="absolute bottom-6 left-4 font-mono text-[11px] leading-[1.9] text-mute sm:bottom-10 sm:left-8">
        {SCAN_STAGES.slice(0, step).map((s, i) => {
          const isLast = i === step - 1 && !final;
          const skipped = DEEP_STAGES.has(i) && baseOnly && status === "done";
          const suffix = isLast ? " …" : skipped ? " · not configured" : " · ok";
          return (
            <motion.div key={s} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
              <span className="text-phosphor/70">{String(i + 1).padStart(2, "0")}</span> {s.toLowerCase()}
              <span className={skipped ? "text-amber/70" : "text-bone/50"}>{suffix}</span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
