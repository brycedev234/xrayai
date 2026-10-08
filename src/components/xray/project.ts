/**
 * Projects a live ScanResult onto the specimen shape the X-ray renderer draws.
 *
 * This is a visual mapping only: cells are the real holder rows, the mass is
 * drawn only when real clusters exist, particle mix follows observed buy/sell
 * counts, and the brain shows no prior-deployment nodes unless they were
 * observed. Nothing here adds data the scan did not return.
 */

import type { ClusterEdge, DiagnosticReading, EdgeKind, Holder as SpecHolder, Specimen, WalletCluster as SpecCluster } from "@/lib/demo/specimenTypes";
import type { RelationshipType, ScanResult, WalletCluster } from "@/lib/types/scan";
import * as d from "@/lib/display";
import type { OrganLabels } from "./ClusterOverlay";

const TYPE_TO_KIND: Partial<Record<RelationshipType, EdgeKind>> = {
  COMMON_FUNDER: "funder",
  DIRECT_TRANSFER: "transfer",
  REPEATED_INTERACTION: "transfer",
  ORIGIN_PROXIMITY: "creator",
  SYNCHRONIZED_ENTRY: "timing",
};

function projectCluster(c: WalletCluster, r: ScanResult): SpecCluster {
  const nodes = new Map(r.mass.nodes.map((n) => [n.wallet, n]));
  const first = Math.min(...c.wallets.map((w) => nodes.get(w)?.firstTokenInteraction ?? Infinity));
  const originLinked = new Set(c.relationships.filter((e) => e.relationshipType === "ORIGIN_PROXIMITY").map((e) => e.to));
  const top = c.commonFunders[0];
  const edges: ClusterEdge[] = c.relationships.flatMap((e) => {
    const kind = TYPE_TO_KIND[e.relationshipType];
    if (!kind || kind === "funder" || kind === "creator") return [];
    return [{ a: e.from, b: e.to, kind }];
  });
  return {
    id: c.id,
    members: c.wallets.map((w) => {
      const n = nodes.get(w);
      return {
        address: w,
        pct: (n?.supplyPercent ?? 0) / 100,
        fundedBy: n?.funder ?? undefined,
        entryOffset: n?.firstTokenInteraction && Number.isFinite(first) ? n.firstTokenInteraction - first : 0,
        creatorLinked: originLinked.has(w),
      };
    }),
    combinedPct: (c.combinedSupplyPercent ?? 0) / 100,
    sharedFunder: top ? { address: top.funder, count: top.wallets } : undefined,
    timing: { count: c.synchronizedEntries?.wallets ?? 0, windowSec: c.synchronizedEntries?.windowSeconds ?? 0 },
    creatorLinked: originLinked.size,
    internalTransfers: c.directTransfers,
    confidence: (c.relationshipSignal ?? 0) / 100,
    edges,
  };
}

export function specimenFromResult(r: ScanResult): Specimen {
  const now = Math.floor(Date.parse(r.caseFile.createdAt) / 1000) || Math.floor(Date.now() / 1000);
  const holders: SpecHolder[] = r.cells.holders
    .filter((h) => h.percent !== null)
    .map((h) => ({
      address: h.address,
      pct: (h.percent as number) / 100,
      firstSeenAt: r.mass.nodes.find((n) => n.wallet === h.address)?.firstTokenInteraction ?? 0,
      tags: h.classification === "POOL" ? ["pool"] : h.classification === "ORIGIN" ? ["creator"] : h.classification === "BURN" ? ["burn"] : h.classification === "PROGRAM" ? ["contract"] : [],
      txCount: 0,
    }));
  const clusters = r.mass.clusters.map((c) => projectCluster(c, r));
  const flags = new Set(r.caseFile.flags.map((f) => f.code));
  const liqIntensity = r.heart.liquidityMarketCapRatio !== null ? Math.max(5, Math.min(95, 100 - r.heart.liquidityMarketCapRatio * 400)) : 50;
  const reading = (key: DiagnosticReading["key"], severity: DiagnosticReading["severity"], intensity = 30): DiagnosticReading => ({ key, label: key, value: "", intensity, severity, notes: [] });
  const tone = r.caseFile.flags[0]?.tone;

  return {
    raw: {
      meta: {
        address: r.address,
        chain: "solana",
        name: r.token.name ?? "",
        symbol: r.token.symbol ?? "",
        totalSupply: r.cells.totalSupply ?? r.genome.supply ?? 0,
        priceUsd: r.token.priceUsd ?? 0,
        marketCapUsd: r.token.marketCap ?? 0,
        createdAt: r.token.ageSeconds !== null ? now - r.token.ageSeconds : now,
        observedAtBlock: 0,
      },
      liquidity: { dex: r.heart.dexId ?? "", poolAddress: r.heart.poolAddress ?? "", poolUsd: r.heart.liquidityUsd ?? 0, lpLockedPct: 0, lpBurnedPct: 0, change24h: 0 },
      holders,
      creator: { address: r.brain.originAddress ?? "", holdsPct: (r.brain.originSupplyPercent ?? 0) / 100, soldPct: 0, priorDeployments: [] },
      transfers: [],
      trades: [],
      knownExchangeFunders: {},
    },
    clusters,
    primaryCluster: clusters[0],
    diagnostics: [
      reading("liquidity", flags.has("LOW_LIQUIDITY") ? "watch" : "stable", liqIntensity),
      reading("creator", flags.has("PRIVILEGED_AUTHORITY_ACTIVE") ? "elevated" : "stable"),
      reading("concentration", flags.has("HIGH_HOLDER_CONCENTRATION") ? "watch" : "stable"),
      reading("cluster", clusters.length ? "elevated" : "stable"),
      reading("flow", "stable"),
    ],
    overall: { severity: tone === "anomaly" ? "elevated" : tone === "watch" ? "watch" : "stable", label: r.caseFile.status, score: 0 },
    scanId: r.caseFile.id,
    scannedAt: now,
    flow: { buys: r.bloodstream.buys24h, sells: r.bloodstream.sells24h },
  };
}

const EVIDENCE: Record<string, string> = {
  FIRST_TRANSACTION_SIGNER: "first signer",
  MINT_AUTHORITY: "mint authority",
  UPDATE_AUTHORITY: "update authority",
  METADATA_CREATOR: "metadata creator",
};

export function organLabels(r: ScanResult): OrganLabels {
  const c = r.mass.clusters[0];
  return {
    creatorTitle: "ORIGIN",
    creator: r.brain.originAddress ? `${d.short(r.brain.originAddress)} · ${EVIDENCE[r.brain.originEvidence ?? ""] ?? "observed"}` : d.DASH,
    liquidity: `${d.usd(r.heart.liquidityUsd, true)} · ${r.heart.lpStatus?.label ?? "LP —"}`,
    holders: `${d.int(r.cells.holderCount)} · top10 ${d.pct(r.cells.top10Percent, 1, { lowerBound: r.cells.lowerBounds.includes("top10") })}`,
    flow: `B ${d.int(r.bloodstream.buys24h)} · S ${d.int(r.bloodstream.sells24h)} · 24h`,
    cluster: c ? `${c.wallets.length} wallets · ${d.pct(c.combinedSupplyPercent)}` : undefined,
  };
}
