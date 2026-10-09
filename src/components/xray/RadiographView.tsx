"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { demoSpecimen } from "@/data/mockScan";
import type { EdgeKind } from "@/lib/demo/specimenTypes";
import * as d from "@/lib/display";
import { feedInfoFromScan } from "@/lib/client/scanClient";
import { formatUtc } from "@/lib/format";
import type { ScanResult } from "@/lib/types/scan";
import { BrandMark } from "../ui/BrandMark";
import { FeedPill } from "../ui/FeedPill";
import { ClusterOverlay } from "./ClusterOverlay";
import { buildLayout } from "./layout";
import { MassReadout } from "./MassReadout";
import { OrganPanel } from "./OrganPanel";
import { organLabels, specimenFromResult } from "./project";
import { TIMELINE, type FocusKey } from "./renderer";
import { SpecimenCanvas } from "./SpecimenCanvas";

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const on = () => setMatches(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

interface Props {
  result: ScanResult;
  onReset: () => void;
}

/** Radiograph of one scan result. Demo results render the demo specimen; live results render only what the scan returned. */
export function RadiographView({ result, onReset }: Props) {
  const demo = result.mode === "demo";
  const scan = useMemo(() => (demo ? demoSpecimen() : specimenFromResult(result)), [demo, result]);
  const labels = useMemo(() => organLabels(result), [result]);
  const layout = useMemo(() => buildLayout(scan), [scan]);
  const [startedAt] = useState(() => performance.now());
  const [stageRef, stage] = useElementSize<HTMLDivElement>();
  const [focus, setFocus] = useState<FocusKey>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [highlightKind, setHighlightKind] = useState<EdgeKind | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ address: string; x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [plain, setPlainState] = useState(true);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const desktop = useMediaQuery("(min-width: 1024px)");

  const reserve = desktop ? 330 : 0;
  const size = Math.max(0, Math.floor(Math.min(stage.h || stage.w, Math.max(stage.w - reserve, stage.w * 0.64))));
  const specimenLeft = reserve ? Math.min(stage.w - size, reserve + (stage.w - reserve - size) / 2) : (stage.w - size) / 2;
  const compact = size < 520;
  const symbol = result.token.symbol ?? d.DASH;
  const createdAt = Math.floor(Date.parse(result.caseFile.createdAt) / 1000);
  const feed = useMemo(() => feedInfoFromScan(result), [result]);

  const nodeInfo = hoveredNode ? layout.clusterNodes.find((n) => n.address === hoveredNode) : undefined;
  const funderHovered = hoveredNode && layout.funder?.address === hoveredNode;
  const cellInfo = hoveredCell ? scan.raw.holders.find((h) => h.address === hoveredCell.address) : undefined;
  const noPair = result.findings.some((f) => f.code === "NO_LIQUIDITY_PAIR_FOUND");

  // Plain-English explanations default on; the choice is remembered per browser.
  useEffect(() => {
    try {
      if (localStorage.getItem("xray:plain") === "0") setPlainState(false);
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);
  const setPlain = (on: boolean) => {
    setPlainState(on);
    try {
      localStorage.setItem("xray:plain", on ? "1" : "0");
    } catch {
      /* storage blocked: the toggle still works for this view */
    }
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(result.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard refused; the address stays in the title attribute */
    }
  };

  return (
    <motion.div className="xray-view relative flex h-full flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
      <header className="relative z-20 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <button type="button" onClick={onReset} className="flex items-center gap-2.5 text-bone" aria-label="Back to scanner">
          <BrandMark className="h-6 w-6" />
          <span className="hidden font-display text-[11px] font-bold tracking-[0.3em] sm:inline">ONCHAIN X-RAY</span>
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-3 font-mono text-[11px] text-mute">
          <span className="hidden h-3 w-px bg-white/10 sm:block" />
          <span className="text-bone">{result.token.symbol ? `$${result.token.symbol}` : d.DASH}</span>
          <span className="hidden truncate sm:inline">{result.token.name ?? ""}</span>
          <span className="hidden rounded-[2px] border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em] sm:inline">solana</span>
          <button type="button" onClick={copyAddress} title={result.address} className="hidden truncate hover:text-bone md:inline">
            {copied ? "copied" : d.short(result.address, 6, 6)}
          </button>
        </div>
        <FeedPill info={feed} />
        <button
          type="button"
          onClick={onReset}
          className="ml-auto rounded-[2px] border border-phosphor/30 px-3.5 py-1.5 font-mono text-[11px] tracking-[0.2em] text-phosphor transition hover:border-phosphor hover:bg-phosphor/10 sm:ml-0"
        >
          NEW SCAN
        </button>
      </header>

      {(noPair || result.mode === "partial") && (
        <div className="relative z-20 mx-4 mb-2 flex flex-wrap gap-x-6 gap-y-1 border border-amber/25 bg-amber/[0.04] px-3 py-2 font-mono text-[10.5px] tracking-[0.14em] text-amber sm:mx-6">
          {noPair && <span>NO LIQUIDITY PAIR FOUND · market values shown as —</span>}
          {result.mode === "partial" && <span>PARTIAL FEED · {result.sources.filter((s) => s.status === "error").map((s) => `${s.provider.toUpperCase()} ${s.note ?? "failed"}`).join(" · ")}</span>}
        </div>
      )}

      <div className="xray-grid min-h-0 flex-1">
        <section className="relative flex min-w-0 flex-col lg:min-h-0">
          <div ref={stageRef} className="stage relative lg:min-h-0">
            <div className="specimen absolute top-1/2 -translate-y-1/2" style={{ width: size, height: size, left: Math.max(0, specimenLeft) }}>
              {size > 0 && (
                <>
                  <SpecimenCanvas
                    scan={scan}
                    layout={layout}
                    size={size}
                    focus={focus}
                    hoveredCell={hoveredCell?.address ?? null}
                    onCellHover={(address, pos) => setHoveredCell(address && pos ? { address, ...pos } : null)}
                    reducedMotion={reducedMotion}
                    startedAt={startedAt}
                  />
                  <ClusterOverlay
                    scan={scan}
                    layout={layout}
                    hovered={hoveredNode}
                    onHover={setHoveredNode}
                    highlightKind={highlightKind}
                    focus={focus}
                    onFocus={setFocus}
                    compact={compact}
                    labels={labels}
                  />
                </>
              )}

              <AnimatePresence>
                {nodeInfo && (
                  <motion.div
                    key={nodeInfo.address}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="glass pointer-events-none absolute z-10 w-[230px] rounded-[3px] p-3.5"
                    style={{ left: `${(nodeInfo.x / 1000) * 100}%`, top: `${(nodeInfo.y / 1000) * 100}%`, transform: "translate(-110%, -50%)" }}
                  >
                    <div className="font-mono text-[10px] tracking-[0.2em] text-infra">LINKED WALLET</div>
                    <div className="mt-1 font-mono text-[13px] text-bone">{d.short(nodeInfo.address, 6, 6)}</div>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-[11px]">
                      <dt className="text-mute">Holds</dt>
                      <dd className="text-right text-bone tabular-nums">{d.pct(nodeInfo.pct * 100, 2)}</dd>
                      <dt className="text-mute">Entry</dt>
                      <dd className="text-right text-bone tabular-nums">{nodeInfo.entryOffset ? `+${d.age(nodeInfo.entryOffset)} after first` : d.DASH}</dd>
                      <dt className="text-mute">Funder</dt>
                      <dd className="text-right text-bone">{nodeInfo.sharesFunder ? "common funder" : nodeInfo.creatorLinked ? "near origin" : nodeInfo.fundedBy ? d.short(nodeInfo.fundedBy) : d.DASH}</dd>
                    </dl>
                  </motion.div>
                )}
                {funderHovered && layout.funder && (
                  <motion.div
                    key="funder"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="glass pointer-events-none absolute z-10 w-[220px] rounded-[3px] p-3.5"
                    style={{ left: `${(layout.funder.x / 1000) * 100}%`, top: `${(layout.funder.y / 1000) * 100}%`, transform: "translate(-105%, -120%)" }}
                  >
                    <div className="font-mono text-[10px] tracking-[0.2em] text-infra">COMMON FUNDER</div>
                    <div className="mt-1 font-mono text-[13px] text-bone">{d.short(layout.funder.address, 6, 6)}</div>
                    <p className="mt-2 text-[12px] leading-snug text-bone/70">Sent first SOL funding to {layout.funder.count} wallets in this group. A shared source, not proof of shared ownership.</p>
                  </motion.div>
                )}
                {cellInfo && hoveredCell && (
                  <motion.div
                    key={cellInfo.address}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="glass pointer-events-none absolute z-10 rounded-[3px] px-3 py-2 font-mono text-[11px]"
                    style={{ left: `${(hoveredCell.x / 1000) * 100}%`, top: `${(hoveredCell.y / 1000) * 100}%`, transform: "translate(14px, -50%)" }}
                  >
                    <div className="text-bone">{d.short(cellInfo.address, 5, 5)}</div>
                    <div className="mt-0.5 text-mute">
                      {d.pct(cellInfo.pct * 100, 2)} of supply{cellInfo.firstSeenAt ? ` · held ${d.age(createdAt - cellInfo.firstSeenAt)}` : ""}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: TIMELINE.beam[1] }}
              className="film-label pointer-events-none absolute left-4 top-2 font-mono text-[10px] leading-[1.7] tracking-[0.16em] text-mute sm:left-6"
            >
              <div className="font-display text-[22px] font-bold tracking-[0.08em] text-bone/90">{result.token.symbol ? `$${symbol}` : d.DASH}</div>
              <div>{result.caseFile.id} · SOLANA</div>
              <div>{formatUtc(createdAt)}</div>
              <div>AGE {d.age(result.token.ageSeconds)}</div>
              {demo && <div className="text-amber/80">DEMO RADIOGRAPHY</div>}
            </motion.div>
            <div className="pointer-events-none absolute right-4 top-2 font-display text-[28px] font-bold text-bone/20 sm:right-6" aria-hidden>
              R
            </div>
          </div>

          <div className="readout-dock px-4 pb-4 sm:px-6 lg:absolute lg:bottom-6 lg:left-6 lg:p-0">
            <MassReadout result={result} highlightKind={highlightKind} onHighlight={setHighlightKind} delay={TIMELINE.tumor[1] - 0.4} plain={plain} />
          </div>
        </section>

        <div className="panel-dock px-4 pb-4 sm:px-6 lg:min-h-0 lg:py-0 lg:pb-6 lg:pl-0">
          <OrganPanel result={result} focus={focus} onFocus={setFocus} delay={0.9} plain={plain} onPlain={setPlain} />
        </div>
      </div>

      <footer className="relative z-10 hidden items-center justify-between px-6 pb-3 font-mono text-[10px] tracking-[0.14em] text-mute lg:flex">
        <span>RELATIONSHIP INDICATORS ARE OBSERVATIONS · NOT EVIDENCE OF INTENT</span>
        <span>{demo ? "SIMULATED DATA · DEMO RADIOGRAPHY" : `SOURCES · ${[...new Set(result.sources.filter((s) => s.status !== "not_configured").map((s) => s.provider.toUpperCase()))].join(" · ")}${result.mass.heliusEnhanced ? "" : " · HELIUS NOT CONFIGURED"}`}</span>
      </footer>
    </motion.div>
  );
}
