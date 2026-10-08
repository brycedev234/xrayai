import type { ClusterEdge, Holder, RawTokenData, WalletCluster } from "./specimenTypes";

/**
 * Relationship heuristics. These surface wallets that look connected on-chain.
 * They describe observable links (funding, transfers, timing), not intent.
 */

const TIMING_WINDOW_SEC = 60;
const MIN_CLUSTER_SIZE = 3;

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let p = this.parent.get(x)!;
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Largest number of timestamps that fit inside `window` seconds, and their actual span. */
export function densestWindow(times: number[], window = TIMING_WINDOW_SEC): { count: number; windowSec: number } {
  const sorted = [...times].sort((a, b) => a - b);
  let best = { count: sorted.length ? 1 : 0, windowSec: 0 };
  let lo = 0;
  for (let hi = 0; hi < sorted.length; hi++) {
    while (sorted[hi] - sorted[lo] > window) lo++;
    const count = hi - lo + 1;
    if (count > best.count) best = { count, windowSec: sorted[hi] - sorted[lo] };
  }
  return best;
}

function isEligible(h: Holder): boolean {
  return !h.tags.some((t) => t === "pool" || t === "cex" || t === "contract" || t === "burn" || t === "creator");
}

export function detectClusters(data: RawTokenData): WalletCluster[] {
  const holders = data.holders.filter(isEligible);
  const byAddress = new Map(holders.map((h) => [h.address, h]));
  const creator = data.creator.address;
  const uf = new UnionFind();
  const edges: ClusterEdge[] = [];

  // 1. Shared funding source (exchange hot wallets excluded: thousands of unrelated users share them).
  const byFunder = new Map<string, Holder[]>();
  for (const h of holders) {
    if (!h.fundedBy || data.knownExchangeFunders[h.fundedBy]) continue;
    const group = byFunder.get(h.fundedBy) ?? [];
    group.push(h);
    byFunder.set(h.fundedBy, group);
  }
  for (const [funder, group] of byFunder) {
    if (group.length < 2) continue;
    const kind = funder === creator ? "creator" : "funder";
    for (let i = 1; i < group.length; i++) {
      uf.union(group[0].address, group[i].address);
      edges.push({ a: group[i - 1].address, b: group[i].address, kind });
    }
  }

  // 2. Direct wallet-to-wallet token transfers between holders.
  for (const t of data.transfers) {
    if (byAddress.has(t.from) && byAddress.has(t.to)) {
      uf.union(t.from, t.to);
      edges.push({ a: t.from, b: t.to, kind: "transfer" });
    }
  }

  // Group into components.
  const components = new Map<string, Holder[]>();
  for (const h of holders) {
    const root = uf.find(h.address);
    const list = components.get(root) ?? [];
    list.push(h);
    components.set(root, list);
  }

  const creatorFunded = new Set(holders.filter((h) => h.fundedBy === creator).map((h) => h.address));
  const creatorRecipients = new Set(data.transfers.filter((t) => t.from === creator).map((t) => t.to));

  const clusters: WalletCluster[] = [];
  let idx = 0;
  for (const members of components.values()) {
    if (members.length < MIN_CLUSTER_SIZE) continue;
    const set = new Set(members.map((m) => m.address));
    const firstEntry = Math.min(...members.map((m) => m.firstSeenAt));

    const funderCounts = new Map<string, number>();
    for (const m of members) {
      if (m.fundedBy && !data.knownExchangeFunders[m.fundedBy]) {
        funderCounts.set(m.fundedBy, (funderCounts.get(m.fundedBy) ?? 0) + 1);
      }
    }
    let sharedFunder: WalletCluster["sharedFunder"];
    for (const [address, count] of funderCounts) {
      if (count >= 2 && (!sharedFunder || count > sharedFunder.count)) sharedFunder = { address, count };
    }

    const timing = densestWindow(members.map((m) => m.firstSeenAt));
    // Timing edges: consecutive members inside the densest window.
    const sortedByTime = [...members].sort((a, b) => a.firstSeenAt - b.firstSeenAt);
    for (let i = 1; i < sortedByTime.length; i++) {
      if (sortedByTime[i].firstSeenAt - sortedByTime[i - 1].firstSeenAt <= TIMING_WINDOW_SEC / 4) {
        edges.push({ a: sortedByTime[i - 1].address, b: sortedByTime[i].address, kind: "timing" });
      }
    }

    const internalTransfers = data.transfers.filter((t) => set.has(t.from) && set.has(t.to)).length;
    const creatorLinked = members.filter((m) => creatorFunded.has(m.address) || creatorRecipients.has(m.address)).length;
    const combinedPct = members.reduce((s, m) => s + m.pct, 0);

    const n = members.length;
    const funderShare = sharedFunder ? sharedFunder.count / n : 0;
    const timingShare = timing.count >= 3 ? timing.count / n : 0;
    const confidence = Math.min(
      0.97,
      0.17 +
        0.45 * funderShare +
        0.16 * timingShare +
        (creatorLinked > 0 ? 0.08 : 0) +
        0.06 * Math.min(1, internalTransfers / 5) +
        0.04 * Math.min(1, n / 10),
    );

    clusters.push({
      id: `C${++idx}`,
      members: members
        .map((m) => ({
          address: m.address,
          pct: m.pct,
          fundedBy: m.fundedBy,
          entryOffset: m.firstSeenAt - firstEntry,
          creatorLinked: creatorFunded.has(m.address) || creatorRecipients.has(m.address),
        }))
        .sort((a, b) => b.pct - a.pct),
      combinedPct,
      sharedFunder,
      timing,
      creatorLinked,
      internalTransfers,
      confidence,
      edges: edges.filter((e) => set.has(e.a) && set.has(e.b)),
    });
  }

  return clusters.sort((a, b) => b.combinedPct * b.confidence - a.combinedPct * a.confidence);
}
