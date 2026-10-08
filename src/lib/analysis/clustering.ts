/**
 * Connected components over relationship edges.
 *
 * Only "meaningful" edge types join wallets into a cluster: common funder,
 * direct transfer, origin proximity and repeated interaction. Synchronized
 * entry and shared counterparty are attached to a cluster as supporting
 * evidence but can never create one, so wallets that merely bought around the
 * same time are not grouped into a MASS.
 */

import type { RelationshipType, WalletCluster, WalletEdge, WalletNode } from "../types/scan";
import { clusterSignal, signalBreakdown } from "./relationshipSignal";

const LINKING: ReadonlySet<RelationshipType> = new Set(["COMMON_FUNDER", "DIRECT_TRANSFER", "ORIGIN_PROXIMITY", "REPEATED_INTERACTION"]);

class UnionFind {
  private parent = new Map<string, string>();
  find(a: string): string {
    if (!this.parent.has(a)) this.parent.set(a, a);
    let p = this.parent.get(a)!;
    if (p !== a) {
      p = this.find(p);
      this.parent.set(a, p);
    }
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function clusterWallets(nodes: WalletNode[], edges: WalletEdge[], origin: string | null): WalletCluster[] {
  const wallets = new Set(nodes.map((n) => n.wallet));
  const uf = new UnionFind();
  for (const w of wallets) uf.find(w);
  for (const e of edges) {
    if (!LINKING.has(e.relationshipType)) continue;
    // The origin may join wallets together but is not itself a holder in the cluster.
    const ok = (a: string) => wallets.has(a) || (origin !== null && a === origin);
    if (ok(e.from) && ok(e.to)) uf.union(e.from, e.to);
  }

  const groups = new Map<string, string[]>();
  for (const w of wallets) {
    const root = uf.find(w);
    groups.set(root, [...(groups.get(root) ?? []), w]);
  }

  const byWallet = new Map(nodes.map((n) => [n.wallet, n]));
  const clusters = [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((members) => {
      const set = new Set(members);
      const inCluster = (a: string) => set.has(a) || (origin !== null && a === origin);
      const relationships = edges.filter((e) => inCluster(e.from) && inCluster(e.to) && (set.has(e.from) || set.has(e.to)));
      const percents = members.map((m) => byWallet.get(m)?.supplyPercent ?? null);
      const combined = percents.every((p) => p !== null) ? (percents as number[]).reduce((a, b) => a + b, 0) : null;

      const funders = new Map<string, Set<string>>();
      for (const e of relationships.filter((r) => r.relationshipType === "COMMON_FUNDER")) {
        const f = String(e.evidence.funder ?? "");
        if (!f) continue;
        const s = funders.get(f) ?? new Set<string>();
        s.add(e.from);
        s.add(e.to);
        funders.set(f, s);
      }
      const syncEdges = relationships.filter((r) => r.relationshipType === "SYNCHRONIZED_ENTRY");
      const syncWallets = new Set(syncEdges.flatMap((e) => [e.from, e.to]));
      const syncWindow = syncEdges.reduce((m, e) => Math.max(m, Number(e.evidence.deltaSeconds ?? 0)), 0);
      const count = (t: RelationshipType) => relationships.filter((r) => r.relationshipType === t).length;

      const withdrawal = new Map<string, WalletCluster["withdrawalSources"][number]>();
      const entities: WalletCluster["entities"] = [];
      for (const m of members) {
        const n = byWallet.get(m);
        if (!n) continue;
        if (n.classification !== "UNKNOWN") entities.push({ address: m, role: "MEMBER", classification: n.classification, name: null });
        if (n.funder && n.funderClass && n.funderClass !== "UNKNOWN") {
          const w = withdrawal.get(n.funder) ?? { source: n.funder, name: n.funderName, classification: n.funderClass, wallets: 0 };
          w.wallets++;
          withdrawal.set(n.funder, w);
        }
      }
      for (const w of withdrawal.values()) entities.push({ address: w.source, role: "FUNDER", classification: w.classification, name: w.name });

      return {
        id: "",
        wallets: members.sort((a, b) => (byWallet.get(b)?.supplyPercent ?? 0) - (byWallet.get(a)?.supplyPercent ?? 0)),
        combinedSupplyPercent: combined,
        relationships,
        commonFunders: [...funders].map(([funder, s]) => ({ funder, wallets: s.size })).sort((a, b) => b.wallets - a.wallets),
        synchronizedEntries: syncWallets.size >= 2 ? { wallets: syncWallets.size, windowSeconds: syncWindow } : null,
        directTransfers: count("DIRECT_TRANSFER"),
        originLinks: count("ORIGIN_PROXIMITY"),
        repeatedInteractions: count("REPEATED_INTERACTION"),
        sharedCounterparties: count("SHARED_COUNTERPARTY"),
        withdrawalSources: [...withdrawal.values()].sort((a, b) => b.wallets - a.wallets),
        entities,
        relationshipSignal: clusterSignal(members, relationships),
        signalBreakdown: signalBreakdown(members, relationships),
      } satisfies WalletCluster;
    })
    .sort((a, b) => (b.combinedSupplyPercent ?? 0) - (a.combinedSupplyPercent ?? 0) || b.wallets.length - a.wallets.length);

  return clusters.map((c, i) => ({ ...c, id: `MASS ${String(i + 1).padStart(2, "0")}` }));
}
