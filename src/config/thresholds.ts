/**
 * Every threshold the findings and status engines use, in one place.
 * They describe structure ("liquidity is under 3% of market cap"); none of
 * them is a verdict. Change a value here and every finding, status and test
 * that depends on it follows.
 */

export const LIQUIDITY = {
  /** Below this USD depth: LOW LIQUIDITY. */
  lowUsd: 10_000,
  /** Liquidity / market cap below this ratio: LOW LIQUIDITY RELATIVE TO MARKET CAP. */
  lowToMarketCap: 0.03,
  /** Pool younger than this: NEW LIQUIDITY POOL. */
  newPoolSeconds: 24 * 3600,
  /** Both conditions: STRONG MARKET DEPTH. */
  strongUsd: 250_000,
  strongToMarketCap: 0.1,
  /** LP burned at or above this percent counts as burned. */
  lpBurnedPercent: 99,
  /** LP locked at or above this percent counts as locked. */
  lpLockedPercent: 50,
} as const;

export const HOLDERS = {
  /** Top 10 non-pool holders above this percent: HIGH HOLDER CONCENTRATION. */
  highTop10Percent: 40,
  /** Largest non-pool holder above this percent: HIGH HOLDER CONCENTRATION. */
  highTop1Percent: 15,
  /** Origin holding at or above this percent is reported; at or above the watch level it is flagged. */
  originHoldingPercent: 1,
  originHoldingWatchPercent: 5,
} as const;

export const FLOW = {
  /** A single token movement of at least this share of supply is a major movement. */
  majorMovementPercent: 0.5,
  /** Sells / buys above this ratio over 24h is reported. */
  sellPressureRatio: 1.5,
  /** Most major movements kept in a result. */
  maxMovements: 12,
} as const;

export const MASS = {
  /** Economically important wallets traced by the graph. */
  graphWalletLimit: 20,
  /** First acquisitions within this many seconds form SYNCHRONIZED_ENTRY. */
  syncWindowSeconds: 45,
  /** Origin proximity is traced at most this many hops (1 = direct, 2 = via one intermediary). */
  originMaxHops: 2,
  /** Intermediaries looked up for two-hop origin proximity. */
  originIntermediaryLimit: 10,
  /** A cluster at or above this signal AND this supply share is ANOMALOUS STRUCTURE. */
  anomalousSignal: 60,
  anomalousSupplyPercent: 10,
  /** The graph is insufficient below this many traced wallets. */
  minWallets: 3,
  /**
   * An unlabeled funder with a full page of recent signatures inside this
   * span is treated as a service (hot wallet, distributor), not a private
   * common funder. Guards against exchange false positives when identity
   * labels are unavailable.
   */
  serviceFunderSignatures: 1000,
  serviceFunderSpanSeconds: 7 * 86400,
} as const;

export const RATE_LIMIT = {
  /** POST /api/scan per IP. */
  scansPerWindow: 10,
  windowMs: 60_000,
} as const;
