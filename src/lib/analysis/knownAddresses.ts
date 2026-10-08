/**
 * Addresses that are infrastructure, not holders. Used to keep pools, burn
 * sinks and launchpad authorities out of concentration and wallet-graph math.
 * A miss here only means an address is analysed as an ordinary wallet; it
 * never creates a relationship by itself.
 */

export const BURN_ADDRESSES = new Set([
  "1nc1nerator11111111111111111111111111111111",
  "11111111111111111111111111111111",
]);

/** AMM / launchpad programs and their shared pool authorities. */
export const POOL_INFRASTRUCTURE: Record<string, string> = {
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1": "Raydium AMM authority",
  GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL: "Raydium CPMM authority",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium AMM program",
  CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C: "Raydium CPMM program",
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: "Raydium CLMM program",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": "Pump.fun program",
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: "PumpSwap program",
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: "Meteora DLMM program",
  Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB: "Meteora pools program",
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: "Orca Whirlpool program",
};

/** Launchpad-wide authorities that sign for every token they create. Never an origin. */
export const SHARED_AUTHORITIES: Record<string, string> = {
  TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM: "Pump.fun metadata authority",
};

const POOL_TAG = /(pool|amm|raydium|orca|meteora|pump|lp\b|liquidity|bonding)/i;

export function isPoolTag(tag: string | null | undefined): boolean {
  return Boolean(tag && POOL_TAG.test(tag));
}
