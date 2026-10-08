/**
 * HEART: liquidity.
 *
 * Market numbers come straight from DexScreener (primary pair chosen
 * deterministically in providers/dexscreener.ts); LP burn / lock state from
 * GoPlus where it reports it. Findings use the documented thresholds in
 * config/thresholds.ts and describe depth, not quality.
 */

import { LIQUIDITY } from "@/config/thresholds";
import type { MarketData } from "../providers/dexscreener";
import type { SecurityData } from "../providers/goplus";
import type { Finding, Heart } from "../types/scan";

export const ratio = (a: number | null, b: number | null) => (a !== null && b !== null && b > 0 ? a / b : null);

export function buildHeart(market: MarketData | null, security: SecurityData | null, now: number): Heart {
  const p = market?.primary ?? null;
  const lpHolders = security?.lpHolders.length
    ? security.lpHolders.map((h) => ({ address: h.owner ?? h.tokenAccount ?? "unknown", percent: h.percent, locked: h.locked, tag: h.tag }))
    : null;
  const lockedPercent = lpHolders ? lpHolders.filter((h) => h.locked).reduce((s, h) => s + (h.percent ?? 0), 0) : null;
  const burned = security?.lpBurnPercent ?? null;
  const lpStatus =
    burned !== null || lockedPercent !== null
      ? {
          burnedPercent: burned,
          lockedPercent,
          label:
            burned !== null && burned >= LIQUIDITY.lpBurnedPercent
              ? "LP BURNED"
              : lockedPercent !== null && lockedPercent >= LIQUIDITY.lpLockedPercent
                ? "LP LOCKED"
                : "LP PARTIALLY SECURED",
        }
      : null;

  return {
    liquidityUsd: market?.liquidityUsd ?? null,
    primaryPool: p ? [p.dexId?.toUpperCase(), p.quoteSymbol].filter(Boolean).join(" · ") || null : null,
    poolAddress: p?.pairAddress ?? null,
    dexId: p?.dexId ?? null,
    poolAgeSeconds: p?.createdAt ? Math.max(0, now - p.createdAt) : null,
    volume24h: market?.volume24h ?? null,
    buys24h: market?.buys24h ?? null,
    sells24h: market?.sells24h ?? null,
    buySellRatio: ratio(market?.buys24h ?? null, market?.sells24h ?? null),
    priceChange24h: market?.priceChange24h ?? null,
    liquidityMarketCapRatio: ratio(market?.liquidityUsd ?? null, market?.marketCap ?? market?.fdv ?? null),
    pairCount: market ? market.pairs.length : null,
    lpStatus,
    lpHolders,
  };
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Liquidity findings. `listed` is false when DexScreener answered with no pair, null when it failed. */
export function liquidityFindings(h: Heart, listed: boolean | null): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, label: string, tone: Finding["tone"], status: Finding["status"], evidence: Finding["evidence"]) =>
    out.push({ code, organ: "HEART", label, tone, status, evidence });

  if (listed === false) {
    f("NO_LIQUIDITY_PAIR_FOUND", "NO LIQUIDITY PAIR FOUND", "watch", "LOW_LIQUIDITY", { pairs: 0 });
    return out;
  }
  const liq = h.liquidityUsd;
  const lr = h.liquidityMarketCapRatio;
  if (liq !== null && liq < LIQUIDITY.lowUsd) {
    f("LOW_LIQUIDITY", `LIQUIDITY ${usd(liq)} IS BELOW ${usd(LIQUIDITY.lowUsd)}`, "watch", "LOW_LIQUIDITY", { liquidityUsd: liq, thresholdUsd: LIQUIDITY.lowUsd });
  }
  if (lr !== null) {
    const pct = (lr * 100).toFixed(1);
    if (lr < LIQUIDITY.lowToMarketCap) {
      f("LOW_LIQUIDITY_RELATIVE_TO_MARKET_CAP", `LOW LIQUIDITY RELATIVE TO MARKET CAP · ${pct}%`, "watch", "LOW_LIQUIDITY", { ratio: lr, threshold: LIQUIDITY.lowToMarketCap });
    } else {
      f("LIQUIDITY_MARKET_CAP_RATIO", `LIQUIDITY REPRESENTS ${pct}% OF MARKET CAP`, "neutral", null, { ratio: lr });
    }
  }
  if (liq !== null && liq >= LIQUIDITY.strongUsd && lr !== null && lr >= LIQUIDITY.strongToMarketCap) {
    f("STRONG_MARKET_DEPTH", `STRONG MARKET DEPTH · ${usd(liq)}`, "neutral", null, { liquidityUsd: liq, ratio: lr });
  }
  if (h.poolAgeSeconds !== null && h.poolAgeSeconds < LIQUIDITY.newPoolSeconds) {
    f("NEW_LIQUIDITY_POOL", `NEW LIQUIDITY POOL · ${Math.floor(h.poolAgeSeconds / 3600)}H OLD`, "watch", null, { poolAgeSeconds: h.poolAgeSeconds, thresholdSeconds: LIQUIDITY.newPoolSeconds });
  }
  if (h.lpStatus?.label === "LP BURNED") f("LP_BURNED", `LP BURNED · ${h.lpStatus.burnedPercent?.toFixed(0)}%`, "neutral", null, { burnedPercent: h.lpStatus.burnedPercent });
  else if (h.lpStatus?.label === "LP LOCKED") f("LP_LOCKED", `LP LOCKED · ${h.lpStatus.lockedPercent?.toFixed(0)}%`, "neutral", null, { lockedPercent: h.lpStatus.lockedPercent });
  return out;
}
