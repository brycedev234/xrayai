"use client";

import { motion } from "framer-motion";
import type { EdgeKind } from "@/lib/demo/specimenTypes";
import * as d from "@/lib/display";
import type { ScanResult } from "@/lib/types/scan";
import { CountUp } from "../ui/CountUp";

interface Props {
  result: ScanResult;
  highlightKind: EdgeKind | null;
  onHighlight: (kind: EdgeKind | null) => void;
  delay: number;
  plain: boolean;
}

const motionProps = (delay: number) => ({
  initial: { opacity: 0, y: 18, filter: "blur(8px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] as const },
});

/** MASS card: the primary connected cluster, or why there is none. */
export function MassReadout({ result, highlightKind, onHighlight, delay, plain }: Props) {
  const { mass, cells } = result;
  const cluster = mass.clusters[0];

  if (!cluster) {
    const state =
      mass.graphState === "NOT_ENABLED"
        ? { title: "DEEP RELATIONSHIP ANALYSIS NOT AVAILABLE", tone: "text-mute", body: "Wallet funding, transfers and entry timing were not traced in this scan: Helius is not configured on this server or did not respond. Holder concentration is still shown.", plain: "We couldn't check whether the big holders are connected." }
        : mass.graphState === "INSUFFICIENT_GRAPH_DATA"
          ? { title: "INSUFFICIENT GRAPH DATA", tone: "text-amber", body: "Too few top holders could be traced to build a relationship graph.", plain: "Not enough wallets could be traced to tell whether the big holders are connected." }
          : { title: "NO MATERIAL CLUSTERS DETECTED", tone: "text-phosphor", body: `${mass.analyzedWallets} top holders traced. No funding, transfer or origin links connect them.`, plain: "The big holders look independent: no shared funder, no transfers between them." };
    return (
      <motion.section {...motionProps(delay)} className="glass relative w-full max-w-[340px] overflow-hidden rounded-[3px] p-5" aria-label="Mass readout">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-scan text-mute">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-mute" />
          MASS · {mass.heliusEnhanced ? "HELIUS ENHANCED" : "BASE MODE"}
        </div>
        <div className={`mt-3 font-display text-[13px] font-bold leading-snug tracking-[0.06em] ${state.tone}`}>{state.title}</div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.06] pt-4 font-mono text-[11px]">
          <div>
            <dt className="text-mute">TOP 10</dt>
            <dd className="mt-1 text-bone">{d.pct(cells.top10Percent, 1, { lowerBound: cells.lowerBounds.includes("top10") })}</dd>
          </div>
          <div>
            <dt className="text-mute">LARGEST HOLDER</dt>
            <dd className="mt-1 text-bone">{d.pct(cells.top1Percent, 1, { lowerBound: cells.lowerBounds.includes("top1") })}</dd>
          </div>
          <div>
            <dt className="text-mute">SIGNAL</dt>
            <dd className="mt-1 text-bone">{mass.relationshipSignal === null ? (mass.heliusEnhanced ? "INSUFFICIENT GRAPH DATA" : d.DASH) : `${mass.relationshipSignal}`}</dd>
          </div>
          <div>
            <dt className="text-mute">WALLETS TRACED</dt>
            <dd className="mt-1 text-bone">{mass.heliusEnhanced ? mass.analyzedWallets : d.DASH}</dd>
          </div>
        </dl>
        <p className="mt-4 text-[11px] leading-relaxed text-mute">{state.body}</p>
        {plain && <p className="mt-2 text-[12px] leading-snug text-bone/75">{state.plain}</p>}
      </motion.section>
    );
  }

  const funders = cluster.commonFunders[0]?.wallets ?? 0;
  const rows: { kind: EdgeKind; label: React.ReactNode; legend: string; show: boolean }[] = [
    { kind: "funder", legend: "solid", show: funders > 0, label: <><b>{funders}</b> share a common funder</> },
    { kind: "timing", legend: "dotted", show: Boolean(cluster.synchronizedEntries), label: <><b>{cluster.synchronizedEntries?.wallets}</b> entered within <b>{cluster.synchronizedEntries?.windowSeconds}</b> seconds</> },
    { kind: "creator", legend: "dashed", show: cluster.originLinks > 0, label: <><b>{cluster.originLinks}</b> near the origin address</> },
    { kind: "transfer", legend: "bone", show: cluster.directTransfers > 0, label: <><b>{cluster.directTransfers}</b> wallet-to-wallet transfers</> },
  ];
  const signal = cluster.relationshipSignal;

  return (
    <motion.section {...motionProps(delay)} className="glass cluster-card relative w-full max-w-[340px] overflow-hidden rounded-[3px] p-5" aria-label="Wallet cluster readout">
      <div className="cluster-card__scan" aria-hidden />
      <div className="flex items-center gap-2 font-mono text-[10px] tracking-scan text-infra">
        <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-infra" />
        {cluster.id} · CONNECTED HOLDERS
      </div>

      <div className="mt-4 flex items-end gap-6">
        <div>
          <div className="font-display text-[44px] font-bold leading-none text-bone">
            <CountUp value={cluster.wallets.length} delay={delay} />
          </div>
          <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-mute">connected wallets</div>
        </div>
        <div>
          <div className="font-display text-[28px] font-bold leading-none text-infra">
            {cluster.combinedSupplyPercent === null ? d.DASH : <CountUp value={cluster.combinedSupplyPercent} decimals={1} suffix="%" delay={delay} />}
          </div>
          <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-mute">combined supply</div>
        </div>
      </div>

      <ul className="mt-5 flex flex-col border-t border-white/[0.06]">
        {rows.filter((r) => r.show).map((row) => (
          <li key={row.kind}>
            <button
              type="button"
              onMouseEnter={() => onHighlight(row.kind)}
              onMouseLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(row.kind)}
              onBlur={() => onHighlight(null)}
              className={`indicator-row group flex w-full items-center gap-3 border-b border-white/[0.06] py-2.5 text-left text-[13px] transition-colors ${highlightKind === row.kind ? "text-bone" : "text-bone/70"}`}
            >
              <span className={`legend legend--${row.legend}`} aria-hidden />
              <span className="flex-1">{row.label}</span>
              <span className="font-mono text-[10px] text-mute opacity-0 transition-opacity group-hover:opacity-100">trace</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <div className="flex items-baseline justify-between font-mono text-[11px]">
          <span className="tracking-[0.18em] text-mute">RELATIONSHIP SIGNAL</span>
          <span className="text-bone">{signal === null ? "INSUFFICIENT GRAPH DATA" : <CountUp value={signal} delay={delay + 0.3} />}</span>
        </div>
        {signal !== null && (
          <div className="mt-2 flex gap-[3px]" aria-hidden>
            {Array.from({ length: 24 }, (_, i) => (
              <motion.span
                key={i}
                className="h-2 flex-1"
                initial={{ opacity: 0.1 }}
                animate={{ opacity: i / 24 < signal / 100 ? 1 : 0.12 }}
                transition={{ delay: delay + 0.4 + i * 0.025 }}
                style={{ background: i / 24 < signal / 100 ? "var(--infra)" : "var(--bone)" }}
              />
            ))}
          </div>
        )}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-mute">
        Observed funding, transfer and timing links. They show wallets that appear connected, not who controls them or why.
        {mass.clusters.length > 1 ? ` ${mass.clusters.length - 1} more group${mass.clusters.length > 2 ? "s" : ""} in the panel.` : ""}
      </p>
      {plain && (
        <p className="mt-2 text-[12px] leading-snug text-bone/75">
          These wallets look like they move together. If one group runs them, it could sell {cluster.combinedSupplyPercent === null ? "its share" : `${d.pct(cluster.combinedSupplyPercent)} of supply`} at once.
        </p>
      )}
    </motion.section>
  );
}
