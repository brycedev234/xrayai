/**
 * DexScreener: public market data, no key.
 * Docs: https://docs.dexscreener.com/api/reference
 *
 * GET /tokens/v1/solana/{tokenAddress} → array of pairs that include the token.
 */

import { cached, TTL } from "../cache/scanCache";
import type { LinkRef, SourceResult } from "../types/scan";
import { describeFailure, fetchJson, num, str } from "./http";

const BASE = "https://api.dexscreener.com";

interface RawWindow {
  m5?: unknown;
  h1?: unknown;
  h6?: unknown;
  h24?: unknown;
}

export interface RawPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  labels?: string[];
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  txns?: Record<keyof RawWindow, { buys?: number; sells?: number } | undefined>;
  volume?: RawWindow;
  priceChange?: RawWindow;
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string; websites?: { label?: string; url?: string }[]; socials?: { type?: string; url?: string; platform?: string; handle?: string }[] };
}

export interface MarketPair {
  dexId: string | null;
  pairAddress: string;
  quoteSymbol: string | null;
  liquidityUsd: number | null;
  createdAt: number | null; // unix seconds
  labels: string[];
}

export interface MarketData {
  name: string | null;
  symbol: string | null;
  image: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  /** Sum of USD liquidity across every pair where the token is the base asset. */
  liquidityUsd: number | null;
  primary: MarketPair | null;
  pairs: MarketPair[];
  volume24h: number | null;
  volume1h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  buys1h: number | null;
  sells1h: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  /** Earliest pair creation (unix seconds). */
  firstPairAt: number | null;
  websites: LinkRef[];
  socials: LinkRef[];
}

const safeLink = (url: unknown): string | null => {
  const s = str(url);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
};

const sumOrNull = (values: (number | null)[]): number | null => {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
};

/** Pure normalizer, exported for fixture tests. Returns null when no pair lists the token as base. */
export function normalizeDexPairs(address: string, raw: unknown): MarketData | null {
  const list: RawPair[] = Array.isArray(raw) ? raw : Array.isArray((raw as { pairs?: unknown })?.pairs) ? (raw as { pairs: RawPair[] }).pairs : [];
  const pairs = list.filter((p) => p && p.chainId === "solana" && p.baseToken?.address === address && str(p.pairAddress));
  if (!pairs.length) return null;

  // Primary pair: deepest USD liquidity, then 24h volume, then pair address, so the
  // choice is deterministic and a thin pool never wins over the main one.
  const byLiquidity = [...pairs].sort(
    (a, b) =>
      (num(b.liquidity?.usd) ?? -1) - (num(a.liquidity?.usd) ?? -1) ||
      (num(b.volume?.h24) ?? -1) - (num(a.volume?.h24) ?? -1) ||
      String(a.pairAddress ?? "").localeCompare(String(b.pairAddress ?? "")),
  );
  const top = byLiquidity[0];
  const toPair = (p: RawPair): MarketPair => ({
    dexId: str(p.dexId),
    pairAddress: p.pairAddress as string,
    quoteSymbol: str(p.quoteToken?.symbol),
    liquidityUsd: num(p.liquidity?.usd),
    createdAt: num(p.pairCreatedAt) !== null ? Math.floor((num(p.pairCreatedAt) as number) / 1000) : null,
    labels: Array.isArray(p.labels) ? p.labels.filter((l) => typeof l === "string") : [],
  });

  const created = pairs.map((p) => num(p.pairCreatedAt)).filter((v): v is number => v !== null);
  const info = byLiquidity.find((p) => p.info)?.info;

  return {
    name: str(top.baseToken?.name),
    symbol: str(top.baseToken?.symbol),
    image: safeLink(info?.imageUrl),
    priceUsd: num(top.priceUsd),
    marketCap: num(top.marketCap),
    fdv: num(top.fdv),
    liquidityUsd: sumOrNull(pairs.map((p) => num(p.liquidity?.usd))),
    primary: toPair(top),
    pairs: byLiquidity.map(toPair),
    volume24h: sumOrNull(pairs.map((p) => num(p.volume?.h24))),
    volume1h: sumOrNull(pairs.map((p) => num(p.volume?.h1))),
    buys24h: sumOrNull(pairs.map((p) => num(p.txns?.h24?.buys))),
    sells24h: sumOrNull(pairs.map((p) => num(p.txns?.h24?.sells))),
    buys1h: sumOrNull(pairs.map((p) => num(p.txns?.h1?.buys))),
    sells1h: sumOrNull(pairs.map((p) => num(p.txns?.h1?.sells))),
    priceChange1h: num(top.priceChange?.h1),
    priceChange24h: num(top.priceChange?.h24),
    firstPairAt: created.length ? Math.floor(Math.min(...created) / 1000) : null,
    websites: (info?.websites ?? []).flatMap((w) => {
      const url = safeLink(w.url);
      return url ? [{ label: (str(w.label) ?? "Website").slice(0, 40), url }] : [];
    }),
    socials: (info?.socials ?? []).flatMap((s) => {
      const url = safeLink(s.url);
      return url ? [{ label: (str(s.type) ?? str(s.platform) ?? "Social").slice(0, 40), url }] : [];
    }),
  };
}

export interface ProviderResult<T> {
  data: T | null;
  source: SourceResult;
}

export async function fetchMarket(address: string, signal?: AbortSignal): Promise<ProviderResult<MarketData>> {
  try {
    const res = await cached(
      `dex:${address}`,
      TTL.market,
      async () => normalizeDexPairs(address, await fetchJson<unknown>("dexscreener", `${BASE}/tokens/v1/solana/${address}`, { timeoutMs: 6000, signal })),
    );
    return {
      data: res.value,
      source: { provider: "dexscreener", scope: "market", status: res.value ? "ok" : "empty", fetchedAt: res.fetchedAt, cached: res.cached, note: res.value ? undefined : "no pairs listed" },
    };
  } catch (err) {
    return { data: null, source: { provider: "dexscreener", scope: "market", status: "error", fetchedAt: null, cached: false, note: describeFailure(err) } };
  }
}

/** Lightweight reachability probe for /api/health (wrapped SOL). */
export async function probeDexScreener(): Promise<boolean> {
  try {
    await fetchJson("dexscreener", `${BASE}/tokens/v1/solana/So11111111111111111111111111111111111111112`, { timeoutMs: 4000 });
    return true;
  } catch {
    return false;
  }
}
