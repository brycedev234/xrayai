/**
 * Chain-agnostic domain model.
 *
 * Adapters (Solana, EVM, mock) return `RawTokenData`. Everything downstream
 * (cluster heuristics, diagnostics, the X-ray visual) only reads these types,
 * so a real data source can be plugged in without touching the UI.
 */

export type ChainId = "solana" | "ethereum" | "base" | "bsc";

export type WalletTag = "creator" | "pool" | "cex" | "contract" | "burn";

export interface TokenMeta {
  address: string;
  chain: ChainId;
  name: string;
  symbol: string;
  totalSupply: number;
  priceUsd: number;
  marketCapUsd: number;
  /** Unix seconds of the token's creation / first mint. */
  createdAt: number;
  /** Block height or slot the data was read at. */
  observedAtBlock: number;
}

export interface LiquidityInfo {
  dex: string;
  poolAddress: string;
  poolUsd: number;
  /** Share of LP tokens locked in a time-lock contract (0-1). */
  lpLockedPct: number;
  /** Share of LP tokens sent to a burn address (0-1). */
  lpBurnedPct: number;
  lockExpiresAt?: number;
  /** Net liquidity change over the last 24h (fraction, e.g. -0.12). */
  change24h: number;
}

export interface Holder {
  address: string;
  /** Share of total supply (0-1). */
  pct: number;
  /** Unix seconds of first buy / receive. */
  firstSeenAt: number;
  /** Wallet that sent this wallet its first native-gas funding. */
  fundedBy?: string;
  tags: WalletTag[];
  txCount: number;
}

export interface CreatorDeployment {
  symbol: string;
  deployedAt: number;
  /** Peak-to-now liquidity retained (0-1). */
  liquidityRetained: number;
}

export interface CreatorInfo {
  address: string;
  fundedBy?: string;
  fundingLabel?: string;
  /** Share of supply the deployer still holds (0-1). */
  holdsPct: number;
  /** Share of supply the deployer has sold since launch (0-1). */
  soldPct: number;
  priorDeployments: CreatorDeployment[];
}

export interface Transfer {
  from: string;
  to: string;
  /** Share of supply moved (0-1). */
  pct: number;
  at: number;
}

export interface Trade {
  wallet: string;
  side: "buy" | "sell";
  usd: number;
  at: number;
}

export interface RawTokenData {
  meta: TokenMeta;
  liquidity: LiquidityInfo;
  holders: Holder[];
  creator: CreatorInfo;
  transfers: Transfer[];
  trades: Trade[];
  /** Funder addresses known to be exchange hot wallets; excluded from shared-funder matching. */
  knownExchangeFunders: Record<string, string>;
}

/* ---------- Derived (computed by /lib/analysis) ---------- */

export type EdgeKind = "funder" | "transfer" | "creator" | "timing";

export interface ClusterEdge {
  a: string;
  b: string;
  kind: EdgeKind;
}

export interface ClusterMember {
  address: string;
  pct: number;
  fundedBy?: string;
  /** Seconds after the cluster's first entry. */
  entryOffset: number;
  creatorLinked: boolean;
}

export interface WalletCluster {
  id: string;
  members: ClusterMember[];
  combinedPct: number;
  sharedFunder?: { address: string; count: number };
  timing: { count: number; windowSec: number };
  creatorLinked: number;
  internalTransfers: number;
  /** 0-1 heuristic confidence that these wallets are related. */
  confidence: number;
  edges: ClusterEdge[];
}

export type Severity = "stable" | "watch" | "elevated";

export interface DiagnosticReading {
  key: "liquidity" | "concentration" | "creator" | "cluster" | "flow";
  label: string;
  /** Headline value, already formatted. */
  value: string;
  /** 0-100, higher means more concerning. */
  intensity: number;
  severity: Severity;
  notes: string[];
}

export interface Specimen {
  raw: RawTokenData;
  clusters: WalletCluster[];
  primaryCluster?: WalletCluster;
  diagnostics: DiagnosticReading[];
  overall: { severity: Severity; label: string; score: number };
  scanId: string;
  scannedAt: number;
  /** Observed trade counts for the bloodstream particles (live scans). Demo specimens use raw.trades. */
  flow?: { buys: number | null; sells: number | null };
}
