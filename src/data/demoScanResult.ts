/**
 * DEMO RADIOGRAPHY: the one place example values live as a ScanResult.
 *
 * Used only when the visitor explicitly picks TRY A SAMPLE / OPEN RADIOGRAPH,
 * and as the design example in the landing CASE FILE. `mode` is always
 * "demo", which every view renders as SIMULATED FEED. Live scans never read
 * from this file.
 */

import { generateFindings } from "@/lib/analysis/findings";
import { signalBreakdown } from "@/lib/analysis/relationshipSignal";
import { evaluateVerdict } from "@/lib/analysis/statusEngine";
import type { RelationshipType, ScanResult, WalletCluster, WalletEdge } from "@/lib/types/scan";
import type { EdgeKind } from "@/lib/demo/specimenTypes";
import { SAMPLE_ADDRESSES } from "@/lib/demo/generate";
import { DEMO_SCAN, demoSpecimen } from "./mockScan";

export const DEMO_ADDRESS = SAMPLE_ADDRESSES.solana;

const KIND_TO_TYPE: Record<EdgeKind, RelationshipType> = {
  funder: "COMMON_FUNDER",
  transfer: "DIRECT_TRANSFER",
  creator: "ORIGIN_PROXIMITY",
  timing: "SYNCHRONIZED_ENTRY",
};

let cachedResult: ScanResult | null = null;

export function demoScanResult(): ScanResult {
  if (cachedResult) return cachedResult;
  const spec = demoSpecimen();
  const d = DEMO_SCAN;
  const now = spec.scannedAt;
  const toCluster = (c: (typeof spec.clusters)[number], i: number, signal: number, combined: number): WalletCluster => {
    const relationships: WalletEdge[] = c.edges.map((e) => ({
      from: e.a,
      to: e.b,
      relationshipType: KIND_TO_TYPE[e.kind],
      timestamp: null,
      evidence: { note: "demo" },
      strength: 0,
    }));
    return {
      id: `MASS ${String(i + 1).padStart(2, "0")}`,
      wallets: c.members.map((m) => m.address),
      combinedSupplyPercent: combined,
      relationships,
      commonFunders: c.sharedFunder ? [{ funder: c.sharedFunder.address, wallets: c.sharedFunder.count }] : [],
      synchronizedEntries: c.timing.count >= 2 ? { wallets: c.timing.count, windowSeconds: c.timing.windowSec } : null,
      directTransfers: c.internalTransfers,
      originLinks: c.creatorLinked,
      repeatedInteractions: 0,
      sharedCounterparties: 0,
      withdrawalSources: [],
      entities: [],
      relationshipSignal: signal,
      signalBreakdown: signalBreakdown(
        c.members.map((m) => m.address),
        relationships,
      ),
    };
  };
  const primary = spec.clusters[0];
  const secondary = spec.clusters[1];
  const clusters = [toCluster(primary, 0, Math.round(d.clusters.primary.signal * 100), d.clusters.primary.combinedSupply * 100)];
  if (secondary) clusters.push(toCluster(secondary, 1, 41, Math.round(secondary.combinedPct * 1000) / 10));

  const largest = spec.raw.holders.find((h) => !h.tags.includes("pool") && !h.tags.includes("creator"));

  cachedResult = {
    mode: "demo",
    chain: "solana",
    address: DEMO_ADDRESS,
    token: {
      name: spec.raw.meta.name,
      symbol: d.token.symbol,
      image: null,
      priceUsd: spec.raw.meta.priceUsd,
      marketCap: spec.raw.meta.marketCapUsd,
      fdv: spec.raw.meta.marketCapUsd,
      ageSeconds: 4 * 3600 + 17 * 60,
      websites: [],
      socials: [],
    },
    genome: {
      mintAuthority: null,
      mintAuthorityActive: false,
      freezeAuthority: null,
      freezeAuthorityActive: false,
      updateAuthority: null,
      metadataMutable: false,
      tokenProgram: "SPL",
      token2022: false,
      transferHook: false,
      transferFee: false,
      defaultAccountState: "INITIALIZED",
      supply: spec.raw.meta.totalSupply,
      decimals: 6,
      extensions: [],
      verifiedBy: [],
    },
    heart: {
      liquidityUsd: d.liquidity.poolUsd,
      primaryPool: "RAYDIUM · SOL",
      poolAddress: spec.raw.liquidity.poolAddress,
      dexId: "raydium",
      poolAgeSeconds: 4 * 3600 + 12 * 60,
      volume24h: 612_487,
      buys24h: 1_284,
      sells24h: 1_107,
      buySellRatio: 1_284 / 1_107,
      priceChange24h: 12.4,
      liquidityMarketCapRatio: d.liquidity.poolUsd / spec.raw.meta.marketCapUsd,
      pairCount: 1,
      lpStatus: { burnedPercent: 100, lockedPercent: null, label: "LP BURNED" },
      lpHolders: null,
    },
    brain: {
      originAddress: spec.raw.creator.address,
      originLabel: "DEPLOYER",
      originEvidence: "FIRST_TRANSACTION_SIGNER",
      originConfidence: "verified",
      mintAuthority: null,
      freezeAuthority: null,
      updateAuthority: null,
      originTokenBalance: spec.raw.meta.totalSupply * 0.024,
      originSupplyPercent: 2.4,
      originMovements: 3,
      priorDeployments: d.deployer.priorDeployments,
      relatedTokens: null,
      authorityLinks: [],
      recentTokenMovements: [],
    },
    cells: {
      holderCount: d.holders.unique,
      holderCountSource: null,
      totalSupply: spec.raw.meta.totalSupply,
      top1Percent: 7.1,
      top5Percent: 21.4,
      top10Percent: 31.8,
      top20Percent: 44.2,
      lowerBounds: [],
      largestNonPoolHolder: largest
        ? { address: largest.address, tokenAccount: null, amount: spec.raw.meta.totalSupply * 0.071, percent: 7.1, classification: "WALLET", tag: null, identity: null }
        : null,
      originSharePercent: 2.4,
      clusterSharePercent: clusters.reduce((s, c) => s + (c.combinedSupplyPercent ?? 0), 0),
      freshWalletSharePercent: 9.6,
      holderSetSize: 20,
      holders: [],
    },
    bloodstream: {
      buys24h: 1_284,
      sells24h: 1_107,
      volume24h: 612_487,
      buySellRatio: 1_284 / 1_107,
      buys1h: 64,
      sells1h: 71,
      volume1h: 21_930,
      priceChange1h: -2.1,
      priceChange24h: 12.4,
      majorMovements: [
        { signature: "demo", timestamp: now - 1800, from: d.flow.largeMovement.from, to: null, amount: null, supplyPercent: null, kind: "TRANSFER", actor: "CLUSTER" },
      ],
      movementsTraced: true,
    },
    mass: {
      heliusEnhanced: true,
      analyzedWallets: 20,
      nodes: [],
      edges: clusters.flatMap((c) => c.relationships),
      clusters,
      relationshipSignal: clusters[0].relationshipSignal,
      graphState: "ENHANCED",
    },
    findings: [],
    caseFile: {
      id: "0XR-84729",
      status: "RELATIONSHIP SIGNALS DETECTED",
      statusCode: "RELATIONSHIP_SIGNALS_DETECTED",
      flags: [
        { code: "RELATIONSHIP_SIGNALS_DETECTED", label: "RELATIONSHIP SIGNALS DETECTED", tone: "anomaly", detail: "2 connected holder groups observed. Demo data." },
      ],
      verdict: { level: "NOT_ENOUGH_DATA", label: "", summary: "", reasons: [] },
      createdAt: new Date(now * 1000).toISOString(),
    },
    coverage: {
      market: true,
      security: true,
      genome: true,
      liquidity: true,
      holders: true,
      origin: true,
      transactions: true,
      walletGraph: true,
      fundingAnalysis: true,
      walletIdentity: true,
    },
    sources: [],
  };
  const demo = cachedResult;
  demo.findings = generateFindings({ ...demo, marketListed: true }).map((f) => ({ ...f, evidence: { ...f.evidence, demo: true } }));
  demo.caseFile.verdict = evaluateVerdict(demo.findings, demo.caseFile.flags, "live");
  return demo;
}
