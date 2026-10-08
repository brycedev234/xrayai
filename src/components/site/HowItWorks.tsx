"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import { demoSpecimen } from "@/data/mockScan";
import { useReducedMotion } from "@/hooks/useInViewport";
import { ClusterOverlay } from "../xray/ClusterOverlay";
import type { FocusKey } from "../xray/renderer";
import { EASE, SectionHead } from "./SectionHead";
import { FULL_VIEW, TokenBody } from "./TokenBody";

const STAGES = [
  {
    code: "01 / INGEST",
    title: "READ THE CONTRACT.",
    body: "Paste any supported Solana or EVM contract address. X-RAY collects what the chain exposes.",
    list: ["holders", "liquidity", "transactions", "deployer activity", "wallet relationships"],
    readout: "INGESTING · 2,914 RECORDS",
  },
  {
    code: "02 / RECONSTRUCT",
    title: "BUILD THE BODY.",
    body: "Wallets, capital flows, liquidity and deployer relationships become an anatomical model. The token stops being a chart. It becomes something you can inspect.",
    readout: "ASSEMBLING · SKELETON → ORGANS",
  },
  {
    code: "03 / DIAGNOSE",
    title: "EXPOSE THE STRUCTURE.",
    body: "X-RAY surfaces unusual concentrations, connected wallets, transaction patterns and capital flows.",
    readout: "DIAGNOSING · 5 SYSTEMS",
  },
];

const ORGAN_CYCLE: Exclude<FocusKey, null>[] = ["liquidity", "creator", "flow", "concentration", "cluster"];
const ORGAN_NAMES: Record<Exclude<FocusKey, null>, string> = {
  liquidity: "HEART",
  creator: "BRAIN",
  flow: "BLOODSTREAM",
  concentration: "CELLS",
  cluster: "MASS",
};

export function HowItWorks() {
  const scan = useMemo(() => demoSpecimen(), []);
  const reduced = useReducedMotion();
  const [stage, setStage] = useState(0);
  const [hoverFocus, setHoverFocus] = useState<FocusKey>(null);
  const stageStart = useRef<{ stage: number; at: number | null }>({ stage: 0, at: null });
  const [cycleFocus, setCycleFocus] = useState<FocusKey>(null);

  const enter = (i: number) => setStage(i);

  // Organ cycle for the diagnose stage, driven from the canvas clock.
  const frame = (t: number) => {
    const s = stageStart.current;
    if (s.stage !== stage || s.at === null) stageStart.current = { stage, at: t };
    const since = t - (stageStart.current.at ?? t);
    if (stage === 0) return { mode: "ingest" as const, ingestT: since };
    if (stage === 1) return { mode: "specimen" as const, revealT: Math.min(since * 0.85, 2.45) };
    const idx = since < 2.6 ? -1 : Math.floor((since - 2.6) / 1.7) % (ORGAN_CYCLE.length + 1);
    const auto = idx >= 0 && idx < ORGAN_CYCLE.length ? ORGAN_CYCLE[idx] : null;
    if (auto !== cycleFocus) queueMicrotask(() => setCycleFocus(auto));
    return { mode: "specimen" as const, revealT: 2.45 + since, focus: hoverFocus ?? auto };
  };

  const focus = hoverFocus ?? cycleFocus;

  return (
    <section id="how-it-works" className="relative px-4 sm:px-8">
      <div className="mx-auto max-w-[1440px] pt-28 sm:pt-40">
        <SectionHead
          eyebrow="PROCEDURE / 01"
          lines={["ONE CONTRACT.", "FULL RADIOGRAPHY."]}
          copy={
            <>
              X-RAY reconstructs a token from its on-chain activity, exposing the structures hidden behind the chart.
              <span className="mt-4 block font-mono text-[11px] tracking-[0.18em] text-phosphor/80">THE TOKEN IS THE PATIENT. WALLETS ARE EVIDENCE INSIDE THE TOKEN.</span>
            </>
          }
        />
      </div>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
        {/* Sticky body: first on mobile so it pins above the stage text */}
        <div className="sticky top-16 z-10 order-1 h-[58vh] bg-gradient-to-b from-[var(--film-950)] from-80% to-transparent lg:order-2 lg:h-[calc(100vh-64px)] lg:bg-none">
          <div className="relative flex h-full items-center justify-center">
            <div className="relative h-full max-h-[860px] w-auto" style={{ aspectRatio: "1 / 1", maxWidth: "100%" }}>
              <TokenBody scan={scan} view={FULL_VIEW} frame={frame} reducedMotion={reduced} label="Token body being scanned">
                {(layout) =>
                  stage === 2 ? (
                    <div className="pointer-events-auto absolute inset-0">
                      <ClusterOverlay
                        scan={scan}
                        layout={layout}
                        hovered={null}
                        onHover={() => {}}
                        highlightKind={null}
                        focus={focus}
                        onFocus={setHoverFocus}
                        compact={false}
                        delayShift={2.6}
                      />
                    </div>
                  ) : null
                }
              </TokenBody>
              <div className="pointer-events-none absolute left-2 top-4 font-mono text-[10px] tracking-[0.2em] text-mute sm:top-10">
                <AnimatePresence mode="wait">
                  <motion.div key={stage} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
                    <span className="blink mr-2 inline-block h-1.5 w-1.5 rounded-full bg-phosphor align-middle" />
                    {STAGES[stage].readout}
                  </motion.div>
                </AnimatePresence>
              </div>
              {stage === 2 && (
                <div className="pointer-events-none absolute bottom-4 left-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tracking-[0.2em] sm:bottom-10">
                  {ORGAN_CYCLE.map((k) => (
                    <span key={k} className={focus === k ? (k === "cluster" ? "text-infra" : "text-phosphor") : "text-mute/60"}>
                      {ORGAN_NAMES[k]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <ol className="relative order-2 lg:order-1">
          {/* Procedure rail */}
          <div className="absolute bottom-[30vh] left-[7px] top-[30vh] w-px bg-white/[0.07]" aria-hidden>
            <motion.div className="w-px bg-phosphor" animate={{ height: `${((stage + 1) / STAGES.length) * 100}%` }} transition={{ duration: 1.2, ease: EASE }} />
          </div>
          {STAGES.map((s, i) => (
            <motion.li
              key={s.code}
              className="relative flex min-h-[78vh] flex-col justify-center pl-10 lg:min-h-screen"
              onViewportEnter={() => enter(i)}
              viewport={{ amount: 0.55 }}
            >
              <span
                className={`absolute left-0 top-1/2 h-[15px] w-[15px] -translate-y-1/2 rounded-full border transition-colors duration-700 ${
                  stage >= i ? "border-phosphor bg-phosphor/20" : "border-white/15 bg-[var(--film-950)]"
                }`}
              />
              <motion.div
                animate={{ opacity: stage === i ? 1 : 0.28 }}
                transition={{ duration: 0.8 }}
              >
                <div className="font-mono text-[11px] tracking-scan text-phosphor/80">{s.code}</div>
                <h3 className="mt-5 font-display text-[clamp(26px,3vw,46px)] font-bold leading-[0.95] text-bone">{s.title}</h3>
                <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-bone/60">{s.body}</p>
                {s.list && (
                  <ul className="mt-6 flex max-w-[46ch] flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
                    {s.list.map((item, j) => (
                      <motion.li
                        key={item}
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 + j * 0.15, duration: 0.8 }}
                      >
                        <span className="text-phosphor/70">+</span> {item}
                      </motion.li>
                    ))}
                  </ul>
                )}
              </motion.div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
