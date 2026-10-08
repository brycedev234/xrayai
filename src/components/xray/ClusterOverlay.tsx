"use client";

import { motion } from "framer-motion";
import { shortAddress } from "@/lib/format";
import { formatPct, formatUsd } from "@/lib/format";
import type { EdgeKind, Specimen } from "@/lib/demo/specimenTypes";
import { ORGANS, type Pt } from "./anatomy";
import type { ClusterNode, SpecimenLayout } from "./layout";
import { TIMELINE, type FocusKey } from "./renderer";

interface Props {
  scan: Specimen;
  layout: SpecimenLayout;
  hovered: string | null;
  onHover: (address: string | null) => void;
  highlightKind: EdgeKind | null;
  focus: FocusKey;
  onFocus: (key: FocusKey) => void;
  compact: boolean;
  /** Seconds to pull the entrance delays forward, when the overlay mounts mid-reveal. */
  delayShift?: number;
  /** Organ label values. When omitted they are derived from the demo specimen. */
  labels?: OrganLabels;
}

export interface OrganLabels {
  creatorTitle: string;
  creator: string;
  liquidity: string;
  holders: string;
  flow: string;
  cluster?: string;
}

interface DrawnEdge {
  id: string;
  kind: EdgeKind;
  from: Pt;
  to: Pt;
  ends: string[];
  bend: number;
}

const KIND_STYLE: Record<EdgeKind, { stroke: string; dash?: string; width: number }> = {
  funder: { stroke: "var(--infra)", width: 1.1 },
  transfer: { stroke: "var(--bone)", width: 1.4 },
  timing: { stroke: "var(--amber)", dash: "2 5", width: 1.4 },
  creator: { stroke: "var(--infra)", dash: "6 6", width: 1.2 },
};

function curve(a: Pt, b: Pt, bend: number): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return `M ${a.x} ${a.y} Q ${mx - dy * bend} ${my + dx * bend} ${b.x} ${b.y}`;
}

function buildEdges(scan: Specimen, layout: SpecimenLayout): DrawnEdge[] {
  const nodeAt = new Map(layout.clusterNodes.map((n) => [n.address, n]));
  const edges: DrawnEdge[] = [];
  const seen = new Set<string>();
  const B = ORGANS.brain;

  if (layout.funder) {
    for (const n of layout.clusterNodes) {
      if (!n.sharesFunder) continue;
      edges.push({ id: `f-${n.address}`, kind: "funder", from: layout.funder, to: n, ends: [n.address, layout.funder.address], bend: 0.12 });
    }
  }
  for (const e of scan.primaryCluster?.edges ?? []) {
    if (e.kind === "funder") continue;
    const a = nodeAt.get(e.a);
    const b = nodeAt.get(e.b);
    if (!a || !b) continue;
    const key = [e.kind, ...[e.a, e.b].sort()].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ id: key, kind: e.kind, from: a, to: b, ends: [e.a, e.b], bend: e.kind === "timing" ? -0.35 : 0.28 });
  }
  for (const n of layout.clusterNodes) {
    if (!n.creatorLinked) continue;
    edges.push({ id: `c-${n.address}`, kind: "creator", from: { x: B.x + 20, y: B.y + 70 }, to: n, ends: [n.address, "creator"], bend: -0.18 });
  }
  return edges;
}

function OrganLabel({
  anchor,
  at,
  align,
  title,
  value,
  focusKey,
  focus,
  onFocus,
  delay,
  tone = "phosphor",
}: {
  anchor: Pt;
  at: Pt;
  align: "start" | "end";
  title: string;
  value: string;
  focusKey: Exclude<FocusKey, null>;
  focus: FocusKey;
  onFocus: (key: FocusKey) => void;
  delay: number;
  tone?: "phosphor" | "infra";
}) {
  const active = focus === focusKey;
  const faded = focus !== null && !active;
  const color = tone === "infra" ? "var(--infra)" : "var(--phosphor)";
  const elbow = { x: at.x + (align === "end" ? 18 : -18), y: at.y - 6 };
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: faded ? 0.3 : 1 }}
      transition={{ duration: 0.6, delay: focus === null ? delay : 0 }}
      style={{ pointerEvents: "auto", cursor: "pointer" }}
      onMouseEnter={() => onFocus(focusKey)}
      onMouseLeave={() => onFocus(null)}
      onFocus={() => onFocus(focusKey)}
      onBlur={() => onFocus(null)}
      tabIndex={0}
      role="button"
      aria-label={`${title}: ${value}`}
    >
      <polyline
        points={`${anchor.x},${anchor.y} ${elbow.x},${elbow.y} ${at.x},${at.y - 6}`}
        fill="none"
        stroke={color}
        strokeOpacity={active ? 0.9 : 0.4}
        strokeWidth={1}
      />
      <circle cx={anchor.x} cy={anchor.y} r={3} fill={color} />
      <text x={at.x} y={at.y - 12} textAnchor={align} className="font-mono" fontSize={11} letterSpacing={2.4} fill={color}>
        {title}
      </text>
      <text x={at.x} y={at.y + 8} textAnchor={align} className="font-mono" fontSize={14} fill="var(--bone)">
        {value}
      </text>
    </motion.g>
  );
}

export function ClusterOverlay({ scan, layout, hovered, onHover, highlightKind, focus, onFocus, compact, delayShift = 0, labels: given }: Props) {
  const edges = buildEdges(scan, layout);
  const cluster = scan.primaryCluster;
  const tumorDelay = Math.max(0, TIMELINE.tumor[0] + 0.6 - delayShift);
  const at = (d: number) => Math.max(0, d - delayShift);
  const filtering = hovered !== null || highlightKind !== null;
  const isActive = (e: DrawnEdge) =>
    (hovered !== null && e.ends.includes(hovered)) || (highlightKind !== null && e.kind === highlightKind);
  const nodeActive = (n: ClusterNode) => {
    if (hovered) return n.address === hovered || edges.some((e) => isActive(e) && e.ends.includes(n.address));
    if (highlightKind) return edges.some((e) => e.kind === highlightKind && e.ends.includes(n.address));
    return true;
  };
  const clusterFaded = focus !== null && focus !== "cluster";

  const liq = scan.diagnostics.find((d) => d.key === "liquidity")!;
  const drained = scan.raw.creator.priorDeployments.filter((d) => d.liquidityRetained < 0.1).length;
  const top10 = scan.raw.holders.filter((h) => !h.tags.includes("pool")).slice(0, 10).reduce((s, h) => s + h.pct, 0);
  const labels: OrganLabels = given ?? {
    creatorTitle: "ORIGIN",
    creator: `${scan.raw.creator.priorDeployments.length} prior · ${drained} < 10% liq`,
    liquidity: `${formatUsd(scan.raw.liquidity.poolUsd)} · ${liq.value}`,
    holders: `${scan.raw.holders.length} · top10 ${formatPct(top10)}`,
    flow: `${scan.raw.trades.length} tx · 24h`,
    cluster: cluster ? `${cluster.members.length} wallets · ${formatPct(cluster.combinedPct)}` : undefined,
  };

  return (
    <svg viewBox="0 0 1000 1000" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden={false}>
      <defs>
        <radialGradient id="node-fill" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="var(--infra)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--infra)" stopOpacity="0.15" />
        </radialGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {!compact && (
        <>
          <OrganLabel anchor={{ x: 548, y: 96 }} at={{ x: 650, y: 82 }} align="start" title={labels.creatorTitle} value={labels.creator} focusKey="creator" focus={focus} onFocus={onFocus} delay={at(TIMELINE.brain[1])} />
          <OrganLabel anchor={{ x: 404, y: 446 }} at={{ x: 214, y: 420 }} align="end" title="LIQUIDITY" value={labels.liquidity} focusKey="liquidity" focus={focus} onFocus={onFocus} delay={at(TIMELINE.heart[1])} />
          <OrganLabel anchor={{ x: 388, y: 640 }} at={{ x: 214, y: 690 }} align="end" title="HOLDERS" value={labels.holders} focusKey="concentration" focus={focus} onFocus={onFocus} delay={at(TIMELINE.cells[1])} />
          <OrganLabel anchor={{ x: 532, y: 380 }} at={{ x: 800, y: 300 }} align="start" title="FLOW" value={labels.flow} focusKey="flow" focus={focus} onFocus={onFocus} delay={at(TIMELINE.vessels[1])} />
          {cluster && (
            <OrganLabel anchor={{ x: 680, y: 776 }} at={{ x: 770, y: 850 }} align="start" title={cluster.id.startsWith("MASS") ? cluster.id : `MASS ${cluster.id.replace(/^C/, "0")}`} value={labels.cluster ?? ""} focusKey="cluster" focus={focus} onFocus={onFocus} delay={at(TIMELINE.tumor[1])} tone="infra" />
          )}
        </>
      )}

      {cluster && (
        <motion.g animate={{ opacity: clusterFaded ? 0.25 : 1 }} transition={{ duration: 0.4 }}>
          {edges.map((e, i) => {
            const style = KIND_STYLE[e.kind];
            const active = isActive(e);
            const d = curve(e.from, e.to, e.bend);
            const baseOpacity = e.kind === "creator" ? 0.35 : e.kind === "funder" ? 0.45 : 0.6;
            return (
              <g key={e.id}>
                <motion.path
                  d={d}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={active ? style.width * 1.8 : style.width}
                  strokeDasharray={style.dash}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: filtering ? (active ? 1 : 0.06) : baseOpacity }}
                  transition={{
                    pathLength: { duration: 1.1, delay: tumorDelay + i * 0.04, ease: "easeOut" },
                    opacity: { duration: 0.25, delay: filtering ? 0 : tumorDelay + i * 0.04 },
                  }}
                />
                {active && (
                  <path d={d} fill="none" stroke={style.stroke} strokeWidth={2.4} className="edge-flow" filter="url(#glow)" />
                )}
              </g>
            );
          })}

          {layout.funder && (
            <motion.g
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: highlightKind && highlightKind !== "funder" ? 0.15 : 1, scale: 1 }}
              transition={{
                scale: { duration: 0.6, delay: tumorDelay + 0.2 },
                opacity: { duration: 0.25, delay: filtering ? 0 : tumorDelay + 0.2 },
              }}
              style={{ transformOrigin: `${layout.funder.x}px ${layout.funder.y}px`, pointerEvents: "auto", cursor: "pointer" }}
              onMouseEnter={() => onHover(layout.funder!.address)}
              onMouseLeave={() => onHover(null)}
            >
              <rect
                x={layout.funder.x - 13}
                y={layout.funder.y - 13}
                width={26}
                height={26}
                transform={`rotate(45 ${layout.funder.x} ${layout.funder.y})`}
                fill="var(--film-900)"
                stroke="var(--infra)"
                strokeWidth={1.6}
                filter="url(#glow)"
              />
              <circle cx={layout.funder.x} cy={layout.funder.y} r={3.5} fill="var(--infra)" />
              {!compact && (
                <>
                  <text x={layout.funder.x} y={layout.funder.y + 44} textAnchor="middle" fontSize={11} letterSpacing={2.4} className="font-mono" fill="var(--infra)">
                    COMMON FUNDER
                  </text>
                  <text x={layout.funder.x} y={layout.funder.y + 62} textAnchor="middle" fontSize={13} className="font-mono" fill="var(--bone)">
                    {shortAddress(layout.funder.address)} → {layout.funder.count}
                  </text>
                </>
              )}
            </motion.g>
          )}

          {layout.clusterNodes.map((n, i) => {
            const active = nodeActive(n);
            const isHovered = hovered === n.address;
            return (
              <motion.g
                key={n.address}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: active ? 1 : 0.18, scale: isHovered ? 1.25 : 1 }}
                transition={{
                  scale: { type: "spring", stiffness: 260, damping: 18, delay: isHovered || hovered ? 0 : tumorDelay + i * 0.07 },
                  opacity: { duration: 0.25, delay: filtering ? 0 : tumorDelay + i * 0.07 },
                }}
                style={{ transformOrigin: `${n.x}px ${n.y}px`, pointerEvents: "auto", cursor: "pointer" }}
                onMouseEnter={() => onHover(n.address)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(n.address)}
                onBlur={() => onHover(null)}
                tabIndex={0}
                role="button"
                aria-label={`Linked wallet ${shortAddress(n.address)}, ${formatPct(n.pct, 2)} of supply`}
              >
                <circle cx={n.x} cy={n.y} r={n.r + 7} fill="transparent" />
                <circle cx={n.x} cy={n.y} r={n.r} fill="url(#node-fill)" stroke="var(--infra)" strokeWidth={isHovered ? 2 : 1} filter={isHovered ? "url(#glow)" : undefined} />
                <circle cx={n.x} cy={n.y} r={n.r + 4} fill="none" stroke="var(--infra)" strokeOpacity={0.35} className="node-ring" style={{ animationDelay: `${i * 0.23}s` }} />
                {n.creatorLinked && <circle cx={n.x} cy={n.y} r={2.4} fill="var(--bone)" />}
              </motion.g>
            );
          })}
        </motion.g>
      )}
    </svg>
  );
}
