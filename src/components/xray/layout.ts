import { createRng, hashString } from "@/lib/demo/random";
import type { Holder, Specimen, WalletCluster } from "@/lib/demo/specimenTypes";
import { ORGANS, torsoHalfWidth, type Pt } from "./anatomy";

export interface ClusterNode extends Pt {
  address: string;
  r: number;
  pct: number;
  fundedBy?: string;
  entryOffset: number;
  creatorLinked: boolean;
  sharesFunder: boolean;
}

export interface Cell extends Pt {
  address: string;
  r: number;
  pct: number;
  phase: number;
  firstSeenAt: number;
}

export interface BrainNode extends Pt {
  phase: number;
  /** Index into creator.priorDeployments, if this node represents one. */
  deployment?: number;
}

export interface SpecimenLayout {
  clusterNodes: ClusterNode[];
  funder?: Pt & { address: string; count: number };
  cells: Cell[];
  brain: BrainNode[];
  brainLinks: [number, number][];
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function layoutCluster(cluster: WalletCluster | undefined): ClusterNode[] {
  if (!cluster) return [];
  const T = ORGANS.tumor;
  const funder = cluster.sharedFunder?.address;
  return cluster.members.map((m, i) => {
    const dist = i === 0 ? 0 : 20 + Math.sqrt(i) * 25;
    const angle = i * GOLDEN + 0.6;
    return {
      x: T.x + Math.cos(angle) * dist,
      y: T.y + Math.sin(angle) * dist * 0.92,
      r: 5 + Math.sqrt(m.pct) * 52,
      address: m.address,
      pct: m.pct,
      fundedBy: m.fundedBy,
      entryOffset: m.entryOffset,
      creatorLinked: m.creatorLinked,
      sharesFunder: !!funder && m.fundedBy === funder,
    };
  });
}

function layoutCells(holders: Holder[], exclude: Set<string>, seed: number): Cell[] {
  const rng = createRng(seed);
  const eligible = holders
    .filter((h) => !exclude.has(h.address) && !h.tags.includes("pool") && !h.tags.includes("creator"))
    .slice(0, 72);
  const placed: Cell[] = [];
  const H = ORGANS.heart;
  const T = ORGANS.tumor;
  for (const h of eligible) {
    const r = 3.5 + Math.sqrt(h.pct) * 58;
    for (let attempt = 0; attempt < 80; attempt++) {
      const y = rng.range(330, 880);
      const half = torsoHalfWidth(y) - r - 8;
      const x = 500 + rng.range(-half, half);
      if (Math.abs(x - 500) < 24 + r) continue;
      if (Math.hypot(x - H.x, y - H.y) < H.r + 34 + r) continue;
      if (Math.hypot(x - T.x, y - T.y) < T.r + 46 + r) continue;
      if (placed.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + r + 6)) continue;
      placed.push({ x, y, r, address: h.address, pct: h.pct, phase: rng.range(0, Math.PI * 2), firstSeenAt: h.firstSeenAt });
      break;
    }
  }
  return placed;
}

function layoutBrain(seed: number, deployments: number): Pick<SpecimenLayout, "brain" | "brainLinks"> {
  const rng = createRng(seed ^ 0x9e3779b9);
  const B = ORGANS.brain;
  const brain: BrainNode[] = [];
  while (brain.length < 34) {
    const x = B.x + rng.range(-1, 1) * 56;
    const y = B.y - 14 + rng.range(-1, 1) * 44;
    if (((x - B.x) / 58) ** 2 + ((y - (B.y - 14)) / 46) ** 2 > 1) continue;
    if (Math.abs(x - B.x) < 4) continue;
    brain.push({ x, y, phase: rng.range(0, Math.PI * 2) });
  }
  for (let i = 0; i < Math.min(deployments, brain.length); i++) brain[i * 3 % brain.length].deployment = i;
  const brainLinks: [number, number][] = [];
  brain.forEach((a, i) => {
    const nearest = brain
      .map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
      .filter((o) => o.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2);
    for (const n of nearest) if (i < n.j) brainLinks.push([i, n.j]);
  });
  return { brain, brainLinks };
}

export function buildLayout(scan: Specimen): SpecimenLayout {
  const seed = hashString(scan.raw.meta.address);
  const cluster = scan.primaryCluster;
  const clusterNodes = layoutCluster(cluster);
  const exclude = new Set(clusterNodes.map((n) => n.address));
  const funder = cluster?.sharedFunder
    ? { x: 848, y: 590, address: cluster.sharedFunder.address, count: cluster.sharedFunder.count }
    : undefined;
  return {
    clusterNodes,
    funder,
    cells: layoutCells(scan.raw.holders, exclude, seed),
    ...layoutBrain(seed, scan.raw.creator.priorDeployments.length),
  };
}
