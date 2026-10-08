import type { ChainId, Holder, RawTokenData, Trade, Transfer } from "./specimenTypes";
import { createRng, fakeAddress, hashString, type Rng } from "./random";

/**
 * Generates a realistic, deterministic token snapshot for any address.
 * A planted wallet cluster gives the heuristics in /lib/analysis something
 * to find, the same way they would on real chain data.
 */

export const SAMPLE_ADDRESSES = {
  solana: "7xKqP3fGm2VbRw9tLnZ8cYhD4sJuEa6NpQkTr1Mvpump",
  base: "0x4e7a91c2b3f8d05a6e1c9b72f3a08d4c5e6b1f29",
} as const;

const TOKEN_NAMES: ReadonlyArray<[string, string]> = [
  ["Wet Cat", "WETCAT"],
  ["Pixel Goblin", "PGOB"],
  ["Hyperbonk", "HBONK"],
  ["Lunar Tortoise", "SHELL"],
  ["Sigma Snail", "SNAIL"],
  ["Gremlin Season", "GREM"],
  ["Tiny Pharaoh", "TUT"],
  ["Static Frog", "STATIC"],
];

interface Profile {
  clusterSize: number;
  clusterPct: number;
  funderCount: number;
  timingCount: number;
  timingWindow: number;
  creatorLinked: number;
  internalTransfers: number;
}

function profileFor(address: string, rng: Rng): Profile {
  if (address === SAMPLE_ADDRESSES.solana) {
    return {
      clusterSize: 11,
      clusterPct: 0.178,
      funderCount: 9,
      timingCount: 7,
      timingWindow: 34,
      creatorLinked: 2,
      internalTransfers: 5,
    };
  }
  const clusterSize = rng.int(7, 14);
  return {
    clusterSize,
    clusterPct: rng.range(0.07, 0.24),
    funderCount: Math.max(3, clusterSize - rng.int(1, 4)),
    timingCount: Math.max(3, Math.round(clusterSize * rng.range(0.45, 0.75))),
    timingWindow: rng.int(12, 52),
    creatorLinked: rng.int(0, 3),
    internalTransfers: rng.int(2, 7),
  };
}

function chainFor(address: string, rng: Rng): ChainId {
  if (!address.startsWith("0x")) return "solana";
  return rng.pick<ChainId>(["base", "base", "ethereum", "bsc"]);
}

/** Splits `total` into `n` positive parts with a heavy-ish tail. */
function splitShares(rng: Rng, n: number, total: number, skew = 1.4): number[] {
  const raw = Array.from({ length: n }, () => Math.pow(rng.range(0.15, 1), skew));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((r) => (r / sum) * total);
}

export function generateMockToken(address: string, now = Math.floor(Date.now() / 1000)): RawTokenData {
  const rng = createRng(hashString(address));
  const chain = chainFor(address, rng);
  const evm = chain !== "solana";
  const addr = () => fakeAddress(rng, evm);
  const profile = profileFor(address, rng);

  const [name, symbol] = rng.pick(TOKEN_NAMES);
  const totalSupply = evm ? 420_690_000_000 : 1_000_000_000;
  const createdAt = address === SAMPLE_ADDRESSES.solana ? now - (4 * 3600 + 17 * 60) : now - rng.int(9, 70) * 3600 - rng.int(0, 3599);
  const marketCapUsd = Math.round(rng.range(380_000, 6_400_000));
  const priceUsd = marketCapUsd / totalSupply;

  const exchanges: Record<string, string> = {
    [addr()]: "Binance hot wallet",
    [addr()]: "Coinbase hot wallet",
    [addr()]: "OKX hot wallet",
  };
  const exchangeAddrs = Object.keys(exchanges);

  const creatorAddr = addr();
  const creatorFunder = addr();
  const poolAddress = addr();
  const clusterFunder = addr();
  const secondaryFunder = addr();
  const launchBuyAt = createdAt + rng.int(40, 600);

  const holders: Holder[] = [];
  const transfers: Transfer[] = [];

  // Pool + creator
  const poolPct = rng.range(0.14, 0.27);
  holders.push({ address: poolAddress, pct: poolPct, firstSeenAt: createdAt, tags: ["pool"], txCount: rng.int(2000, 9000) });
  const creatorPct = address === SAMPLE_ADDRESSES.solana ? (rng.next(), 0.024) : rng.range(0.004, 0.035);
  holders.push({ address: creatorAddr, pct: creatorPct, firstSeenAt: createdAt, fundedBy: creatorFunder, tags: ["creator"], txCount: rng.int(6, 40) });

  // Planted cluster
  const shares = splitShares(rng, profile.clusterSize, profile.clusterPct, 1.2);
  const clusterAddrs: string[] = [];
  for (let i = 0; i < profile.clusterSize; i++) {
    const a = addr();
    clusterAddrs.push(a);
    let fundedBy: string;
    if (i < profile.funderCount) fundedBy = clusterFunder;
    else if (i - profile.funderCount < profile.creatorLinked) fundedBy = creatorAddr;
    else fundedBy = rng.pick(exchangeAddrs);
    const firstSeenAt = i < profile.timingCount
      ? launchBuyAt + Math.round((i / Math.max(1, profile.timingCount - 1)) * profile.timingWindow)
      : launchBuyAt + profile.timingWindow + rng.int(140, 2400) + i * 61;
    holders.push({ address: a, pct: shares[i], firstSeenAt, fundedBy, tags: [], txCount: rng.int(3, 28) });
  }
  // Wallets outside the shared-funder group are tied in through direct token transfers.
  for (let i = profile.funderCount; i < clusterAddrs.length; i++) {
    transfers.push({ from: clusterAddrs[i], to: clusterAddrs[rng.int(0, profile.funderCount - 1)], pct: rng.range(0.001, 0.006), at: launchBuyAt + rng.int(300, 3000) });
  }
  for (let i = 0; i < profile.internalTransfers; i++) {
    const from = clusterAddrs[rng.int(0, clusterAddrs.length - 1)];
    let to = clusterAddrs[rng.int(0, clusterAddrs.length - 1)];
    if (to === from) to = clusterAddrs[(clusterAddrs.indexOf(from) + 1) % clusterAddrs.length];
    transfers.push({ from, to, pct: rng.range(0.0008, 0.006), at: launchBuyAt + rng.int(900, 20000) });
  }

  // Smaller secondary group (weaker signal)
  const secondary = rng.int(3, 4);
  const secShares = splitShares(rng, secondary, rng.range(0.012, 0.03));
  const secStart = launchBuyAt + rng.int(3600, 9000);
  for (let i = 0; i < secondary; i++) {
    holders.push({ address: addr(), pct: secShares[i], firstSeenAt: secStart + rng.int(0, 1800) + i * 200, fundedBy: secondaryFunder, tags: [], txCount: rng.int(2, 12) });
  }

  // Organic holders
  const listedSoFar = holders.reduce((s, h) => s + h.pct, 0);
  const organicCount = rng.int(64, 82);
  const organicShares = splitShares(rng, organicCount, Math.max(0.2, 0.86 - listedSoFar), 2.6);
  for (let i = 0; i < organicCount; i++) {
    holders.push({
      address: addr(),
      pct: organicShares[i],
      firstSeenAt: launchBuyAt + rng.int(30, now - launchBuyAt),
      fundedBy: rng.chance(0.55) ? rng.pick(exchangeAddrs) : addr(),
      tags: rng.chance(0.03) ? ["contract"] : [],
      txCount: rng.int(1, 60),
    });
  }
  holders.sort((a, b) => b.pct - a.pct);

  // Trades over the last 24h
  const trades: Trade[] = [];
  const tradeCount = rng.int(260, 420);
  const traders = holders.filter((h) => !h.tags.includes("pool"));
  const clusterSet = new Set(clusterAddrs);
  const dayAgo = Math.max(createdAt, now - 86400);
  for (let i = 0; i < tradeCount; i++) {
    const h = rng.pick(traders);
    const isCluster = clusterSet.has(h.address);
    const at = Math.round(rng.range(dayAgo, now));
    const sellBias = isCluster ? 0.68 : h.tags.includes("creator") ? 0.8 : 0.44;
    trades.push({
      wallet: h.address,
      side: rng.chance(sellBias) ? "sell" : "buy",
      usd: Math.round(Math.pow(rng.next(), 2.2) * (isCluster ? 9000 : 4200) + 25),
      at,
    });
  }
  trades.sort((a, b) => a.at - b.at);

  const priorCount = address === SAMPLE_ADDRESSES.solana ? 7 : rng.int(2, 7);
  const priorDeployments = Array.from({ length: priorCount }, (_, i) => ({
    symbol: rng.pick(["PEPU", "KITTY", "BRRR", "ZOOM", "MOG2", "FLOKO", "BEANS", "YETI", "CHUD"]) + (i > 3 ? i : ""),
    deployedAt: createdAt - rng.int(4, 120) * 86400,
    liquidityRetained: rng.chance(0.6) ? rng.range(0.01, 0.09) : rng.range(0.2, 0.9),
  })).sort((a, b) => b.deployedAt - a.deployedAt);

  const lpBurnedPct = rng.chance(0.5) ? rng.range(0.6, 1) : 0;
  const lpLockedPct = lpBurnedPct > 0 ? 0 : rng.chance(0.35) ? 0 : rng.range(0.4, 0.95);

  // The featured sample is tuned to show every organ under stress.
  const featured = address === SAMPLE_ADDRESSES.solana;
  if (featured) priorDeployments.forEach((d, i) => (d.liquidityRetained = i % 3 === 2 ? 0.42 : 0.03 + i * 0.008));

  return {
    meta: {
      address,
      chain,
      name,
      symbol,
      totalSupply,
      priceUsd,
      marketCapUsd,
      createdAt,
      observedAtBlock: evm ? rng.int(19_800_000, 23_400_000) : rng.int(301_000_000, 368_000_000),
    },
    liquidity: {
      dex: evm ? (chain === "bsc" ? "PancakeSwap v2" : "Uniswap v2") : rng.pick(["Raydium CPMM", "PumpSwap", "Meteora DLMM"]),
      poolAddress,
      poolUsd: featured ? 184_291 : Math.round(marketCapUsd * rng.range(0.05, 0.19)),
      lpLockedPct: featured ? 0 : lpLockedPct,
      lpBurnedPct: featured ? 1 : lpBurnedPct,
      lockExpiresAt: lpLockedPct > 0 && !featured ? now + rng.int(3, 120) * 86400 : undefined,
      change24h: featured ? 0.124 : rng.range(-0.34, 0.12),
    },
    holders,
    creator: {
      address: creatorAddr,
      fundedBy: creatorFunder,
      fundingLabel: rng.pick(["Fresh wallet, 3 txs", "Bridged from Ethereum", "Funded via instant swap service"]),
      holdsPct: creatorPct,
      soldPct: rng.range(0.01, 0.06),
      priorDeployments,
    },
    transfers,
    trades,
    knownExchangeFunders: exchanges,
  };
}
