"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { DEMO_SCAN, type RelationshipKind } from "@/data/mockScan";
import { useReducedMotion } from "@/hooks/useInViewport";
import { useRevealProgress } from "@/hooks/useRevealProgress";
import { EASE, SectionHead } from "./SectionHead";
import { BOUNDARY, DISCOVERY, WalletNetwork } from "./WalletNetwork";

const COUNTS = Object.fromEntries(DEMO_SCAN.relationships.map((r) => [r.kind, r.count])) as Record<RelationshipKind, number>;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function Readout({
  value,
  label,
  discovered,
  big = false,
}: {
  value: string;
  label: string;
  discovered: number;
  big?: boolean;
}) {
  return (
    <div className="border-t border-white/[0.07] py-4 transition-opacity duration-700" style={{ opacity: 0.25 + 0.75 * discovered }}>
      <div className={`font-display font-bold leading-none tabular-nums ${big ? "text-[clamp(34px,3.6vw,52px)] text-infra" : "text-[26px] text-bone"}`}>{value}</div>
      <div className="mt-2 font-mono text-[10px] tracking-[0.22em] text-mute">{label}</div>
    </div>
  );
}

export function MassDetection() {
  const c = DEMO_SCAN.clusters.primary;
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const { progress, progressRef, replay } = useRevealProgress(stageRef, 11, reduced);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setCompact(mq.matches);
    const on = () => setCompact(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);


  const found = (k: RelationshipKind) => clamp01((progress - DISCOVERY[k][0]) / (DISCOVERY[k][1] - DISCOVERY[k][0]));
  const boundary = clamp01((progress - BOUNDARY[0]) / (BOUNDARY[1] - BOUNDARY[0]));
  const signal = c.signal * clamp01((progress - 0.18) / 0.77);
  const segments = 10;
  const lit = Math.round(signal * segments);
  const done = progress >= 1;

  return (
    <section id="mass" className="relative overflow-hidden px-4 pt-28 sm:px-8 sm:pt-40">
      <div className="mass-section__glow" aria-hidden />
      <div className="relative mx-auto max-w-[1440px]">
        <SectionHead eyebrow="CLUSTER ANALYSIS / 04" tone="infra" lines={["ONE WALLET CAN", "LOOK NORMAL.", "ELEVEN TOGETHER", "MAY NOT."]} />

        <div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
          <div ref={stageRef} className="relative min-w-0 border border-white/[0.06] bg-[rgba(6,10,18,0.4)]">
            <div className="aspect-[4/3.4] w-full sm:aspect-[16/11]">
              <WalletNetwork progress={progressRef} clusterSize={c.wallets} counts={COUNTS} compact={compact} reducedMotion={reduced} />
            </div>
            <div className="pointer-events-none absolute left-4 top-4 font-mono text-[10px] tracking-[0.2em] text-mute">
              {done ? "GRAPH RESOLVED" : progress > 0 ? "CORRELATING WALLETS" : "AWAITING SCAN"}
              <span className="ml-2 tabular-nums text-bone/60">{Math.round(progress * 100)}%</span>
            </div>
            <div className="flex flex-wrap px-4 pb-3 sm:absolute sm:bottom-3 sm:left-4 sm:right-4 sm:p-0 items-center gap-x-5 gap-y-1 font-mono text-[10px] tracking-[0.16em] text-mute">
              {DEMO_SCAN.relationships.map((r) => (
                <span key={r.kind} className="flex items-center gap-2 transition-opacity duration-700" style={{ opacity: 0.3 + 0.7 * found(r.kind) }}>
                  <span className={`legend legend--net-${r.kind}`} aria-hidden />
                  {r.label.toUpperCase()}
                </span>
              ))}
              <button type="button" onClick={replay} className="pointer-events-auto ml-auto text-phosphor/80 transition hover:text-phosphor" disabled={!done}>
                {done ? "RESCAN ↻" : ""}
              </button>
            </div>
          </div>

          <motion.aside
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 1.1, ease: EASE }}
            className="min-w-0 self-start border-l border-infra/30 pl-6"
            aria-label="Mass diagnostic"
          >
            <div className="flex items-center justify-between font-mono text-[11px] tracking-scan">
              <span className="text-infra">{c.id}</span>
              <span className="text-mute">{boundary > 0.5 ? "MASS RESOLVED" : "FORMING"}</span>
            </div>
            <div className="mt-5">
              <Readout big value={`${c.wallets}`} label="WALLETS · CONNECTED GROUP" discovered={clamp01(progress / 0.2)} />
              <Readout big value={`${(c.combinedSupply * 100 * clamp01((progress - 0.1) / 0.6)).toFixed(1)}%`} label="COMBINED SUPPLY" discovered={clamp01(progress / 0.3)} />
              <Readout value={`${Math.round(c.commonFunding * found("funder"))} / ${c.wallets}`} label="COMMON FUNDING RELATIONSHIP" discovered={found("funder")} />
              <Readout value={`${Math.round(c.timing.count * found("timing"))}`} label={`ENTERED WITHIN ${c.timing.windowSec} SECONDS`} discovered={found("timing")} />
              <Readout value={`${Math.round(c.deployerHops * found("deployer"))}`} label="DIRECT DEPLOYER HOPS" discovered={found("deployer")} />
            </div>

            <div className="border-t border-white/[0.07] pt-5">
              <div className="flex items-baseline justify-between font-mono text-[11px]">
                <span className="tracking-[0.2em] text-mute">RELATIONSHIP SIGNAL</span>
                <span className="tabular-nums text-bone">{Math.round(signal * 100)}%</span>
              </div>
              <div className="mt-3 flex gap-[4px]" aria-hidden>
                {Array.from({ length: segments }, (_, i) => (
                  <span key={i} className="h-3.5 flex-1 transition-colors duration-500" style={{ background: i < lit ? "var(--infra)" : "rgba(216,230,242,0.08)" }} />
                ))}
              </div>
            </div>

            <p className="mt-6 border-t border-white/[0.07] pt-4 font-mono text-[10px] leading-[1.7] text-mute">
              <span className="text-bone/50">NOTE ·</span> Relationship indicators describe observable on-chain patterns. They do not establish
              fraudulent intent, common ownership, or wrongdoing.
            </p>
          </motion.aside>
        </div>
      </div>
    </section>
  );
}
