"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientScanError, FeedState } from "@/lib/client/scanClient";
import { SAMPLE_ADDRESSES } from "@/lib/demo/generate";
import { detectAddressKind } from "@/lib/validation/address";
import { checkAddress, ScanErrorLine, type ScanSource } from "./scanInput";
import { demoSpecimen } from "@/data/mockScan";
import { buildLayout } from "../xray/layout";
import { SpecimenCanvas } from "../xray/SpecimenCanvas";
import { MethodSheet } from "./MethodSheet";
import { AnatomySection } from "../site/AnatomySection";
import { CaseFile } from "../site/CaseFile";
import { FinalScanCTA } from "../site/FinalScanCTA";
import { Footer } from "../site/Footer";
import { HowItWorks } from "../site/HowItWorks";
import { MassDetection } from "../site/MassDetection";
import { PhilosophySection } from "../site/PhilosophySection";
import { GenomeSection } from "../site/GenomeSection";
import { SocialsSection } from "../site/SocialsSection";
import { NAV_HEIGHT, TopNav } from "../site/TopNav";
import { TransactionFlow } from "../site/TransactionFlow";

const ORGAN_LEGEND = [
  ["Heart", "Liquidity"],
  ["Genome", "Token config"],
  ["Brain", "Origin"],
  ["Cells", "Holders"],
  ["Bloodstream", "Market flow"],
  ["Mass", "Connected clusters"],
] as const;

export type { ScanSource } from "./scanInput";

function GhostSpecimen() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  const [startedAt] = useState(() => performance.now() - 300);
  const scan = useMemo(() => demoSpecimen(), []);
  const layout = useMemo(() => buildLayout(scan), [scan]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize(Math.floor(Math.min(e.contentRect.width, e.contentRect.height))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="ghost relative h-full w-full" aria-hidden>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: size, height: size }}>
        {size > 0 && (
          <SpecimenCanvas
            scan={scan}
            layout={layout}
            size={size}
            focus={null}
            hoveredCell={null}
            onCellHover={() => {}}
            reducedMotion={false}
            startedAt={startedAt}
          />
        )}
      </div>
    </div>
  );
}

interface Props {
  onScan: (address: string, source: ScanSource) => void;
  error: { source: ScanSource; error: ClientScanError } | null;
  feed: FeedState;
  onClearError: () => void;
}

export function Landing({ onScan, error: externalError, feed, onClearError }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [methodOpen, setMethodOpen] = useState(false);
  const scrollerRef = useRef<HTMLElement>(null);
  const kind = detectAddressKind(value);
  const shownError = error ?? (externalError?.source === "hero" ? externalError.error : null);

  const submit = (address = value) => {
    const problem = checkAddress(address);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onScan(address.trim(), "hero");
  };

  return (
    <motion.main
      ref={scrollerRef}
      className="landing relative z-10 h-full overflow-y-auto overflow-x-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: "blur(10px)", scale: 1.02 }}
      transition={{ duration: 0.7 }}
    >
      <TopNav scroller={scrollerRef} feed={feed} />

      {/* HERO (unchanged design; its nav row now lives in the sticky TopNav) */}
      <div id="top" className="hero relative flex flex-col" style={{ minHeight: `calc(100dvh - ${NAV_HEIGHT}px)` }}>
      <div className="relative grid flex-1 items-center gap-8 px-4 pb-10 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:pb-6">
        <div className="pointer-events-none absolute inset-0 opacity-30 lg:static lg:order-2 lg:h-full lg:min-h-[480px] lg:opacity-60">
          <GhostSpecimen />
        </div>

        <div className="relative z-10 min-w-0 lg:order-1 lg:pl-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="font-mono text-[11px] tracking-scan text-phosphor/80"
          >
            TOKEN RADIOGRAPHY · SOLANA
          </motion.div>

          <h1 className="mt-5 font-display font-bold leading-[0.86] tracking-[-0.02em] text-bone" style={{ fontSize: "clamp(52px, 10.5vw, 168px)" }}>
            <motion.span
              className="block outline-text"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.1, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              ONCHAIN
            </motion.span>
            <motion.span
              className="title-xray block"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              X-RAY
              <span className="title-xray__lit" aria-hidden>
                X-RAY
              </span>
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="mt-6 text-[clamp(17px,1.6vw,22px)] font-medium text-bone/70"
          >
            See what the chart doesn&rsquo;t.
          </motion.p>

          <motion.form
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.95, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="mt-10 max-w-[640px]"
          >
            <div className="glass flex flex-col gap-0 rounded-[3px] p-1.5 sm:flex-row sm:items-stretch">
              <label htmlFor="ca-input" className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 sm:py-0">
                <span className="font-mono text-[10px] tracking-[0.24em] text-mute">CA</span>
                <input
                  id="ca-input"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                    if (externalError) onClearError();
                  }}
                  placeholder="Paste Solana token mint address"
                  spellCheck={false}
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent font-mono text-[14px] text-bone placeholder:text-mute/70 focus:outline-none"
                />
                <AnimatePresence>
                  {kind && (
                    <motion.span
                      initial={{ opacity: 0, x: 6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className={`shrink-0 font-mono text-[10px] tracking-[0.2em] ${kind === "evm" ? "text-amber" : "text-phosphor"}`}
                    >
                      {kind === "evm" ? "EVM · NOT SUPPORTED" : "SOLANA"}
                    </motion.span>
                  )}
                </AnimatePresence>
              </label>
              <button
                type="submit"
                className="scan-button flex h-[60px] items-center justify-center gap-3 rounded-[2px] px-8 font-display text-[13px] font-bold tracking-[0.28em] transition sm:h-[64px]"
              >
                SCAN TOKEN
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M1 8h12M9 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </button>
            </div>

            <div className="mt-3 min-h-[20px]">
              {shownError && (
                <div className="mb-3">
                  <ScanErrorLine error={shownError} />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-mute">
                  <button
                    type="button"
                    className="tracking-[0.2em] text-bone/70 underline-offset-4 hover:text-phosphor hover:underline"
                    onClick={() => {
                      setValue(SAMPLE_ADDRESSES.solana);
                      submit(SAMPLE_ADDRESSES.solana);
                    }}
                  >
                    TRY A SAMPLE →
                  </button>
                  <span className="tracking-[0.16em]">SAMPLE USES DEMO DATA · SIMULATED FEED</span>
                </div>
            </div>
          </motion.form>
        </div>
      </div>

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.3, duration: 1 }}
        className="relative z-10 grid grid-cols-3 gap-x-6 gap-y-3 border-t border-white/[0.05] px-4 py-5 font-mono text-[10px] tracking-[0.18em] sm:grid-cols-6 sm:px-8"
      >
        {ORGAN_LEGEND.map(([organ, meaning]) => (
          <div key={organ} className="flex flex-col gap-1">
            <span className={organ === "Mass" ? "text-infra" : "text-phosphor/80"}>{organ.toUpperCase()}</span>
            <span className="text-mute">{meaning}</span>
          </div>
        ))}
      </motion.footer>
      </div>

      <HowItWorks />
      <GenomeSection />
      <AnatomySection />
      <MassDetection />
      <TransactionFlow />
      <CaseFile onOpen={() => onScan(SAMPLE_ADDRESSES.solana, "hero")} />
      <PhilosophySection />
      <FinalScanCTA onScan={(a) => onScan(a, "final")} error={externalError?.source === "final" ? externalError.error : null} onClearError={onClearError} />
      <SocialsSection />
      <Footer
        onMethod={() => setMethodOpen(true)}
        onTop={() => {
          scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          setTimeout(() => document.getElementById("ca-input")?.focus({ preventScroll: true }), 700);
        }}
      />

      <MethodSheet open={methodOpen} onClose={() => setMethodOpen(false)} />
    </motion.main>
  );
}
