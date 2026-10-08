/**
 * Normalized scan result returned by POST /api/scan.
 *
 * Rules:
 * - Every chain-derived value is nullable. `null` means "not observed", never
 *   zero. The UI renders it as "—" (or a NOT ENABLED / INSUFFICIENT DATA label).
 * - Percentages named `*Percent` are 0-100. Token amounts are UI amounts
 *   (decimals already applied).
 * - Nothing in here is ever filled from demo data unless `mode === "demo"`.
 */

export type ScanMode = "live" | "partial" | "demo";
export type ProviderId = "dexscreener" | "goplus" | "helius";

export interface SourceResult {
  provider: ProviderId;
  /** What the provider was asked for, e.g. "market", "security", "holders". */
  scope: string;
  status: "ok" | "empty" | "error" | "not_configured";
  /** ISO time the data was fetched (from cache or network). */
  fetchedAt: string | null;
  cached: boolean;
  /** Short, user-safe note. Never contains keys, URLs or stack traces. */
  note?: string;
}

/** Tri-state configuration value. */
export type FlagState = "ACTIVE" | "REVOKED" | "NOT_PRESENT" | "UNKNOWN" | "INSUFFICIENT_DATA" | "NOT_ENABLED";

export interface Genome {
  mintAuthority: string | null;
  /** true = authority set, false = revoked, null = not observed. */
  mintAuthorityActive: boolean | null;
  freezeAuthority: string | null;
  freezeAuthorityActive: boolean | null;
  updateAuthority: string | null;
  metadataMutable: boolean | null;
  tokenProgram: "SPL" | "TOKEN-2022" | null;
  token2022: boolean | null;
  transferHook: boolean | null;
  transferFee: boolean | null;
  defaultAccountState: "INITIALIZED" | "FROZEN" | null;
  supply: number | null;
  decimals: number | null;
  extensions: string[] | null;
  /** Providers that contributed to the genome. */
  verifiedBy: ProviderId[];
}

export interface LinkRef {
  label: string;
  url: string;
}

export interface TokenIdentity {
  name: string | null;
  symbol: string | null;
  image: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  /** Seconds since the earliest observed pair / token creation. */
  ageSeconds: number | null;
  websites: LinkRef[];
  socials: LinkRef[];
}

export interface LpHolder {
  address: string;
  percent: number | null;
  locked: boolean | null;
  tag: string | null;
}

export interface Heart {
  liquidityUsd: number | null;
  /** Human label of the primary pool, e.g. "RAYDIUM · SOL". */
  primaryPool: string | null;
  poolAddress: string | null;
  dexId: string | null;
  poolAgeSeconds: number | null;
  volume24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  buySellRatio: number | null;
  priceChange24h: number | null;
  liquidityMarketCapRatio: number | null;
  pairCount: number | null;
  lpStatus: { burnedPercent: number | null; lockedPercent: number | null; label: string } | null;
  lpHolders: LpHolder[] | null;
}

export type OriginEvidence =
  | "MINT_AUTHORITY"
  | "UPDATE_AUTHORITY"
  | "METADATA_CREATOR"
  | "FIRST_TRANSACTION_SIGNER";

export interface Brain {
  originAddress: string | null;
  /** Label the evidence supports: DEPLOYER (first tx signer), AUTHORITY (mint/update authority), CREATOR (metadata creator). */
  originLabel: "ORIGIN" | "DEPLOYER" | "AUTHORITY" | "CREATOR" | null;
  /** Which observable fact identified the origin. */
  originEvidence: OriginEvidence | null;
  /** verified = read from chain; reported = third-party field; inferred = derived heuristically. */
  originConfidence: "verified" | "reported" | "inferred" | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  updateAuthority: string | null;
  originTokenBalance: number | null;
  originSupplyPercent: number | null;
  /** Outbound token movements by the origin observed in the analyzed window. */
  originMovements: number | null;
  priorDeployments: number | null;
  relatedTokens: string[] | null;
  /** Observed relationships between the origin and the token's authorities, e.g. "ORIGIN IS MINT AUTHORITY". */
  authorityLinks: string[];
  /** The origin's recent movements of this token (Helius). */
  recentTokenMovements: Movement[];
}

export type HolderClass = "POOL" | "BURN" | "PROGRAM" | "EXCHANGE" | "ORIGIN" | "LOCKED" | "WALLET";

export interface Holder {
  /** Owner wallet when known, otherwise the token account. */
  address: string;
  tokenAccount: string | null;
  amount: number | null;
  percent: number | null;
  classification: HolderClass;
  tag: string | null;
  /** Entity name from Helius identity, when known (e.g. an exchange hot wallet). */
  identity: string | null;
}

export interface Cells {
  /** Total holder count as reported by a provider; null when no provider reports it. */
  holderCount: number | null;
  holderCountSource: ProviderId | null;
  totalSupply: number | null;
  top1Percent: number | null;
  top5Percent: number | null;
  top10Percent: number | null;
  top20Percent: number | null;
  /** Keys among top1..top20 that are lower bounds because the holder set is truncated. */
  lowerBounds: ("top1" | "top5" | "top10" | "top20")[];
  largestNonPoolHolder: Holder | null;
  originSharePercent: number | null;
  /** Combined supply share of all connected holder clusters (MASS); null without a wallet graph. */
  clusterSharePercent: number | null;
  /** Requires per-wallet history (Helius). */
  freshWalletSharePercent: number | null;
  /** Size of the holder set the concentration figures are based on. */
  holderSetSize: number;
  holders: Holder[];
}

export interface Movement {
  signature: string;
  timestamp: number;
  from: string | null;
  to: string | null;
  amount: number | null;
  supplyPercent: number | null;
  /**
   * BUY / SELL only when the transaction is a swap AND the direction is known
   * from the wallet's side. A plain transfer is never reported as a sell.
   */
  kind: "BUY" | "SELL" | "TRANSFER" | "LIQUIDITY" | "UNKNOWN";
  /** Who moved: the origin, a major holder, or a wallet inside a MASS cluster. */
  actor: "ORIGIN" | "MAJOR_HOLDER" | "CLUSTER" | null;
}

export interface Bloodstream {
  buys24h: number | null;
  sells24h: number | null;
  volume24h: number | null;
  buySellRatio: number | null;
  buys1h: number | null;
  sells1h: number | null;
  volume1h: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  majorMovements: Movement[];
  /** false = movement tracing needs Helius; the list above is empty for that reason. */
  movementsTraced: boolean;
}

export type RelationshipType =
  | "COMMON_FUNDER"
  | "DIRECT_TRANSFER"
  | "SYNCHRONIZED_ENTRY"
  | "ORIGIN_PROXIMITY"
  | "REPEATED_INTERACTION"
  | "SHARED_COUNTERPARTY"
  /** Funder is an exchange / protocol / infrastructure. Informational; never implies common ownership. */
  | "COMMON_WITHDRAWAL_SOURCE";

export type IdentityClass = "CENTRALIZED_EXCHANGE" | "DEX" | "PROTOCOL" | "TREASURY" | "BRIDGE" | "KNOWN_SERVICE" | "UNKNOWN";

export interface WalletNode {
  wallet: string;
  balance: number | null;
  supplyPercent: number | null;
  classification: IdentityClass;
  identity: string | null;
  /** Unix seconds of the first observed token acquisition. */
  firstTokenInteraction: number | null;
  funder: string | null;
  funderName: string | null;
  funderClass: IdentityClass | null;
}

export interface WalletEdge {
  from: string;
  to: string;
  relationshipType: RelationshipType;
  timestamp: number | null;
  evidence: Record<string, string | number | null>;
  /** 0-1, from the documented weights in relationshipSignal.ts. */
  strength: number;
}

export interface WalletCluster {
  id: string;
  wallets: string[];
  combinedSupplyPercent: number | null;
  relationships: WalletEdge[];
  commonFunders: { funder: string; wallets: number }[];
  synchronizedEntries: { wallets: number; windowSeconds: number } | null;
  directTransfers: number;
  originLinks: number;
  repeatedInteractions: number;
  sharedCounterparties: number;
  /** Exchange / infrastructure sources shared by members. Shown, never used to link wallets. */
  withdrawalSources: { source: string; name: string | null; classification: IdentityClass; wallets: number }[];
  /** Members (and their funders) with a known entity classification. */
  entities: { address: string; role: "MEMBER" | "FUNDER"; classification: IdentityClass; name: string | null }[];
  /** 0-100. Relationship signal, never a probability of anything. */
  relationshipSignal: number | null;
  /** Exactly why the signal has its value: one row per relationship type present. */
  signalBreakdown: SignalComponent[];
}

export interface SignalComponent {
  type: RelationshipType;
  weight: number;
  /** Share of the cluster's wallets touched by at least one edge of this type (0-1). */
  coverage: number;
  /** Points this type adds on its own (100 * weight * coverage, before combining). */
  points: number;
}

export interface Mass {
  heliusEnhanced: boolean;
  /** Wallets the graph analysis covered (0 in base mode). */
  analyzedWallets: number;
  nodes: WalletNode[];
  edges: WalletEdge[];
  clusters: WalletCluster[];
  /** 0-100 or null when the graph is insufficient. */
  relationshipSignal: number | null;
  /** Why the graph is empty, when it is. */
  graphState: "ENHANCED" | "NOT_ENABLED" | "INSUFFICIENT_GRAPH_DATA" | "NO_RELATIONSHIPS";
}

export type StatusCode =
  | "ANOMALOUS_STRUCTURE_DETECTED"
  | "RELATIONSHIP_SIGNALS_DETECTED"
  | "PRIVILEGED_AUTHORITY_ACTIVE"
  | "HIGH_HOLDER_CONCENTRATION"
  | "LOW_LIQUIDITY"
  | "PARTIAL_SCAN"
  | "INSUFFICIENT_DATA"
  | "NO_MAJOR_STRUCTURAL_FLAGS_DETECTED";

export type Organ = "GENOME" | "HEART" | "BRAIN" | "CELLS" | "BLOODSTREAM" | "MASS" | "SCAN";

/**
 * A factual observation derived from the scan, e.g. "TOP 10 HOLDERS CONTROL
 * 42.1%". Findings never say SAFE, SCAM or RUG; `status` names the case-file
 * status this finding supports, if any.
 */
export interface Finding {
  code: string;
  organ: Organ;
  label: string;
  tone: "anomaly" | "watch" | "neutral";
  status: StatusCode | null;
  evidence: Record<string, string | number | boolean | null>;
}

export interface StatusFlag {
  code: StatusCode;
  label: string;
  tone: "anomaly" | "watch" | "neutral";
  detail: string;
}

export interface CaseFileMeta {
  id: string;
  status: string;
  statusCode: StatusCode;
  flags: StatusFlag[];
  /** Plain-language read of how many red flags the scan found. Never "safe". */
  verdict: Verdict;
  createdAt: string;
}

export interface Verdict {
  level: "SERIOUS_RED_FLAGS" | "SOME_RED_FLAGS" | "FEW_RED_FLAGS" | "NOT_ENOUGH_DATA";
  label: string;
  /** One sentence, always including the limit of what a scan can show. */
  summary: string;
  /** The findings behind the verdict. */
  reasons: string[];
}

export interface Coverage {
  market: boolean;
  security: boolean;
  genome: boolean;
  liquidity: boolean;
  holders: boolean;
  origin: boolean;
  transactions: boolean;
  walletGraph: boolean;
  fundingAnalysis: boolean;
  walletIdentity: boolean;
}

export interface ScanResult {
  mode: ScanMode;
  chain: "solana";
  address: string;
  token: TokenIdentity;
  genome: Genome;
  heart: Heart;
  brain: Brain;
  cells: Cells;
  bloodstream: Bloodstream;
  mass: Mass;
  findings: Finding[];
  caseFile: CaseFileMeta;
  coverage: Coverage;
  sources: SourceResult[];
}

export type ScanErrorCode =
  | "INVALID_CONTRACT"
  | "TOKEN_NOT_FOUND"
  | "NETWORK_NOT_SUPPORTED"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "INTERNAL";

export interface ScanErrorBody {
  error: { code: ScanErrorCode; message: string };
}
