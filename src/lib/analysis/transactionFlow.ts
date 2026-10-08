/**
 * BLOODSTREAM: market flow and token movements.
 *
 * 24h buys / sells / volume come from DexScreener. Movements come only from
 * parsed Helius transactions (the mint's recent transactions, plus the
 * histories of the origin and the traced holders). No event is synthesized:
 * without Helius the movement list is empty and `movementsTraced` is false.
 *
 * Classification (never confuses a transfer with a sell):
 *   LIQUIDITY  the transaction adds / removes liquidity or creates a pool
 *   BUY        a swap in which the token leaves a pool, or the fee payer receives it
 *   SELL       a swap in which the token enters a pool, or the fee payer sends it
 *   TRANSFER   a plain transfer
 *   UNKNOWN    anything the evidence does not settle
 */

import { FLOW } from "@/config/thresholds";
import type { MarketData } from "../providers/dexscreener";
import type { EnhancedTx, WalletTransfer } from "../providers/helius";
import type { Bloodstream, Movement } from "../types/scan";
import { ratio } from "./liquidityAnalysis";

const LIQUIDITY_TYPES = /LIQUIDITY|CREATE_POOL|INITIALIZE_POOL|ADD_TO_POOL|WITHDRAW_FROM_POOL/;

export interface FlowContext {
  mint: string;
  supply: number | null;
  /** Pool accounts and pool owners (pair addresses, pool authorities, POOL-classified holders). */
  pools: Set<string>;
  origin: string | null;
  majorHolders: Set<string>;
  clusterWallets: Set<string>;
}

export function classifyMovement(txType: string | null, feePayer: string | null, from: string | null, to: string | null, pools: Set<string>): Movement["kind"] {
  if (txType && LIQUIDITY_TYPES.test(txType)) return "LIQUIDITY";
  if (txType === "SWAP") {
    if ((from && pools.has(from)) || (feePayer && feePayer === to)) return "BUY";
    if ((to && pools.has(to)) || (feePayer && feePayer === from)) return "SELL";
    return "UNKNOWN";
  }
  if (txType === "TRANSFER") return "TRANSFER";
  return "UNKNOWN";
}

function actorOf(from: string | null, to: string | null, ctx: FlowContext): Movement["actor"] {
  const is = (set: Set<string> | string | null, a: string | null) => Boolean(a && (typeof set === "string" ? set === a : set?.has(a)));
  if (is(ctx.origin, from) || is(ctx.origin, to)) return "ORIGIN";
  if (is(ctx.clusterWallets, from) || is(ctx.clusterWallets, to)) return "CLUSTER";
  if (is(ctx.majorHolders, from) || is(ctx.majorHolders, to)) return "MAJOR_HOLDER";
  return null;
}

function movement(ctx: FlowContext, signature: string, timestamp: number, txType: string | null, feePayer: string | null, from: string | null, to: string | null, amount: number | null): Movement {
  return {
    signature,
    timestamp,
    from,
    to,
    amount,
    supplyPercent: amount !== null && ctx.supply ? (amount / ctx.supply) * 100 : null,
    kind: classifyMovement(txType, feePayer, from, to, ctx.pools),
    actor: actorOf(from, to, ctx),
  };
}

/** Token movements from the mint's recent transactions. */
export function mintMovements(txs: EnhancedTx[] | null, ctx: FlowContext): Movement[] {
  const out: Movement[] = [];
  for (const tx of txs ?? []) {
    for (const t of tx.tokenTransfers) {
      if (t.mint !== ctx.mint) continue;
      out.push(movement(ctx, tx.signature, tx.timestamp, tx.type, tx.feePayer, t.from, t.to, t.amount));
    }
  }
  return out;
}

/** Token movements from one wallet's transfer history (origin or holder). */
export function walletMovements(wallet: string, transfers: WalletTransfer[] | null, ctx: FlowContext): Movement[] {
  return (transfers ?? [])
    .filter((t) => t.asset === ctx.mint)
    .map((t) => movement(ctx, t.signature, t.timestamp, t.txType, wallet === t.from || wallet === t.to ? wallet : null, t.from, t.to, t.amount));
}

const key = (m: Movement) => `${m.signature}:${m.from}:${m.to}`;

/** Major movements: at least FLOW.majorMovementPercent of supply, de-duplicated, largest first. */
export function majorMovements(all: Movement[]): Movement[] {
  const seen = new Set<string>();
  return all
    .filter((m) => (m.supplyPercent ?? 0) >= FLOW.majorMovementPercent)
    .filter((m) => (seen.has(key(m)) ? false : (seen.add(key(m)), true)))
    .sort((a, b) => (b.supplyPercent ?? 0) - (a.supplyPercent ?? 0) || b.timestamp - a.timestamp)
    .slice(0, FLOW.maxMovements);
}

export function buildBloodstream(market: MarketData | null, movements: Movement[], traced: boolean): Bloodstream {
  return {
    buys24h: market?.buys24h ?? null,
    sells24h: market?.sells24h ?? null,
    volume24h: market?.volume24h ?? null,
    buySellRatio: ratio(market?.buys24h ?? null, market?.sells24h ?? null),
    buys1h: market?.buys1h ?? null,
    sells1h: market?.sells1h ?? null,
    volume1h: market?.volume1h ?? null,
    priceChange1h: market?.priceChange1h ?? null,
    priceChange24h: market?.priceChange24h ?? null,
    majorMovements: movements,
    movementsTraced: traced,
  };
}
