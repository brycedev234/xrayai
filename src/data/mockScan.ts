/**
 * Demo radiography used by the marketing sections of the site.
 *
 * These are DESIGN EXAMPLES for the explanatory sections of the landing page.
 * Live scans never read from here (see lib/analysis/scanToken.ts); the
 * case-file example lives in demoScanResult.ts.
 */

import { generateMockToken, SAMPLE_ADDRESSES } from "@/lib/demo/generate";
import { analyzeToken } from "@/lib/demo/specimen";
import type { Specimen } from "@/lib/demo/specimenTypes";

export type RelationshipKind = "funder" | "timing" | "transfer" | "deployer" | "behavior";

export interface DemoRelationship {
  kind: RelationshipKind;
  label: string;
  /** How many wallets / links in the primary cluster show this indicator. */
  count: number;
}

export interface FlowEventDemo {
  from: string;
  amount: string;
  destinations: number;
  label: string;
}

export interface DemoScan {
  token: { symbol: string; chain: "SOLANA" | "EVM"; address: string; age: string };
  liquidity: { poolUsd: number; change24h: number; lpDistribution: string; poolAge: string; strength: number };
  deployer: { priorDeployments: number; relatedContracts: number; connectedWallets: number; fundingOrigin: string };
  holders: { unique: number; topHolderShare: number; top10Share: number; retention24h: number; new1h: number; exiting1h: number };
  transactions: { buyUsd: number; sellUsd: number; largeMovements: number; walletVelocity: string; netFlowUsd: number };
  clusters: {
    detected: number;
    primary: {
      id: string;
      wallets: number;
      combinedSupply: number;
      commonFunding: number;
      timing: { count: number; windowSec: number };
      deployerHops: number;
      transfers: number;
      signal: number;
    };
  };
  relationships: DemoRelationship[];
  flow: { largeMovement: FlowEventDemo; labels: string[] };
  caseFile: { id: string; status: string; coverage: string };
}

export const DEMO_SCAN: DemoScan = {
  token: { symbol: "HBONK", chain: "SOLANA", address: SAMPLE_ADDRESSES.solana, age: "04H 17M" },
  liquidity: { poolUsd: 184_291, change24h: 0.124, lpDistribution: "100% burned", poolAge: "04H 12M", strength: 0.68 },
  deployer: { priorDeployments: 7, relatedContracts: 3, connectedWallets: 5, fundingOrigin: "Instant-swap service" },
  holders: { unique: 1842, topHolderShare: 0.071, top10Share: 0.318, retention24h: 0.71, new1h: 64, exiting1h: 23 },
  transactions: { buyUsd: 412_800, sellUsd: 371_250, largeMovements: 6, walletVelocity: "3.4 tx/h", netFlowUsd: 41_550 },
  clusters: {
    detected: 2,
    primary: {
      id: "MASS 01",
      wallets: 11,
      combinedSupply: 0.178,
      commonFunding: 9,
      timing: { count: 7, windowSec: 34 },
      deployerHops: 4,
      transfers: 6,
      signal: 0.82,
    },
  },
  relationships: [
    { kind: "funder", label: "Common funder", count: 9 },
    { kind: "timing", label: "Entry timing", count: 7 },
    { kind: "transfer", label: "Direct transfers", count: 6 },
    { kind: "deployer", label: "Deployer hops", count: 4 },
    { kind: "behavior", label: "Shared behavior", count: 5 },
  ],
  flow: {
    largeMovement: { from: "0x7a…91e", amount: "42.8 SOL", destinations: 3, label: "LARGE MOVEMENT DETECTED" },
    labels: ["BUY", "SELL", "TRANSFER", "FUND", "LP", "NEW WALLET", "RELATED WALLET"],
  },
  caseFile: { id: "0XR-84729", status: "RELATIONSHIP SIGNALS DETECTED", coverage: "HIGH DATA COVERAGE" },
};

/** Full specimen (holders, vessels, cluster nodes) that the body visuals render. */
let specimen: Specimen | null = null;
export function demoSpecimen(): Specimen {
  if (!specimen) specimen = analyzeToken(generateMockToken(SAMPLE_ADDRESSES.solana));
  return specimen as Specimen;
}
