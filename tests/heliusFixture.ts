/**
 * A fixture "world" for the Helius path: one mint, its holders, their
 * funders, histories and identities, served through a mocked fetch that
 * imitates the DexScreener, GoPlus, Helius RPC, Enhanced Transactions and
 * Wallet API response shapes. Everything here is FIXTURE data.
 */

import assert from "node:assert/strict";
import * as helius from "@/lib/providers/helius";
import { addr, dexPairs, goplusBody, status } from "./helpers";

export const KEY = "fixture-secret-key-123";
export const POOL_AUTH = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1";
export const T0 = 1_760_000_000;

export interface WorldOptions {
  /** wallet → funded-by body; missing = 404. */
  funders?: (w: World) => Record<string, unknown>;
  /** wallet → identity body; missing = 404. */
  identities?: (w: World) => Record<string, unknown>;
  /** wallet → enhanced history. */
  histories?: (w: World) => Record<string, unknown[]>;
  /** address → number of signatures in its latest page (activity check). */
  activity?: (w: World) => Record<string, number>;
  /** Respond 403 from the Enhanced Transactions API (plan without it). */
  noEnhancedApi?: boolean;
  /** Respond 403 from the Wallet API (plan without it). */
  noWalletApi?: boolean;
  /** Every Helius request fails with 500. */
  heliusDown?: boolean;
  liquidity?: number;
  mcap?: number;
}

export interface World {
  mint: string;
  origin: string;
  funder: string;
  exchange: string;
  w: string[];
  holders: [string, number][];
  tokenAccounts: string[];
  /** Raw jsonParsed transactions for the RPC fallback, by signature. */
  rawTxs: Record<string, unknown>;
  /** Signatures per address for the RPC fallback. */
  sigs: Record<string, { signature: string; blockTime: number }[]>;
}

export const tx = (mint: string, sig: string, ts: number, native: [string, string, number][], tokens: [string, string, number][], type = "TRANSFER") => ({
  signature: sig,
  timestamp: ts,
  type,
  feePayer: native[0]?.[0] ?? tokens[0]?.[1],
  nativeTransfers: native.map(([a, b, l]) => ({ fromUserAccount: a, toUserAccount: b, amount: l })),
  tokenTransfers: tokens.map(([a, b, amt]) => ({ fromUserAccount: a, toUserAccount: b, mint, tokenAmount: amt })),
});

export function makeWorld(): World {
  const mint = addr();
  const w = [addr(), addr(), addr(), addr(), addr()];
  const holders: [string, number][] = [[POOL_AUTH, 200e6], [w[4], 80e6], [w[0], 50e6], [w[1], 40e6], [w[2], 30e6], [w[3], 20e6]];
  return { mint, origin: addr(), funder: addr(), exchange: addr(), w, holders, tokenAccounts: holders.map(() => addr()), rawTxs: {}, sigs: {} };
}

export function heliusHandler(world: World, opts: WorldOptions = {}) {
  const { mint, holders, tokenAccounts, origin } = world;
  const owners = new Map(tokenAccounts.map((t, i) => [t, holders[i][0]]));
  const funders = opts.funders?.(world) ?? {};
  const identities = opts.identities?.(world) ?? {};
  const histories = opts.histories?.(world) ?? {};
  const activity = opts.activity?.(world) ?? {};

  return async (url: string, init?: RequestInit) => {
    if (url.startsWith("https://api.dexscreener.com/")) return dexPairs(mint, { liquidity: opts.liquidity ?? 150000, mcap: opts.mcap ?? 900000 });
    if (url.startsWith("https://api.gopluslabs.io/")) return goplusBody(mint, { holderCount: "512" });
    assert.ok(url.includes(encodeURIComponent(KEY)), "Helius calls carry the key server-side");
    if (opts.heliusDown) return status(500);
    if (url.startsWith("https://mainnet.helius-rpc.com/")) {
      const { method, params } = JSON.parse(String(init?.body));
      switch (method) {
        case "getAccountInfo":
          return { result: { value: { owner: helius.TOKEN_PROGRAM, data: { parsed: { type: "mint", info: { decimals: 6, supply: "1000000000000000", mintAuthority: null, freezeAuthority: null, extensions: [] } } } } } };
        case "getAsset":
          return { result: { authorities: [], mutable: false } };
        case "getTokenLargestAccounts":
          return { result: { value: tokenAccounts.map((t, i) => ({ address: t, uiAmountString: String(holders[i][1]) })) } };
        case "getMultipleAccounts":
          return {
            result: {
              value: (params[0] as string[]).map((a) =>
                owners.has(a) ? { owner: helius.TOKEN_PROGRAM, data: { parsed: { info: { owner: owners.get(a) } } } } : { owner: a === POOL_AUTH ? "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8" : helius.SYSTEM_PROGRAM, executable: false },
              ),
            },
          };
        case "getSignaturesForAddress": {
          const address = params[0] as string;
          if (address === mint) return { result: [{ signature: "genesis", blockTime: T0 - 600 }] };
          if (activity[address]) return { result: Array.from({ length: activity[address] }, (_, i) => ({ signature: `act-${i}`, blockTime: T0 - i * 60 })) };
          return { result: world.sigs[address] ?? [] };
        }
        case "getTransaction": {
          if (params[0] === "genesis") return { result: { blockTime: T0 - 600, transaction: { message: { accountKeys: [{ pubkey: origin, signer: true }] } } } };
          return { result: world.rawTxs[params[0] as string] ?? null };
        }
        case "getTokenAccountsByOwner":
          return { result: { value: [{ account: { data: { parsed: { info: { tokenAmount: { uiAmountString: "24000000" } } } } } }] } };
        case "getAssetsByAuthority":
          return { result: { items: [{ id: mint, interface: "FungibleToken" }, { id: addr(), interface: "FungibleToken" }, { id: addr(), interface: "V1_NFT" }] } };
      }
      throw new Error(`unhandled rpc ${method}`);
    }
    const t = url.match(/\/v0\/addresses\/([^/]+)\/transactions/);
    if (t) return opts.noEnhancedApi ? status(403) : (histories[t[1]] ?? []);
    const fb = url.match(/\/v1\/wallet\/([^/]+)\/funded-by/);
    if (fb) return opts.noWalletApi ? status(403) : (funders[fb[1]] ?? status(404));
    const id = url.match(/\/v1\/wallet\/([^/]+)\/identity/);
    if (id) return opts.noWalletApi ? status(403) : (identities[id[1]] ?? status(404));
    throw new Error(`unexpected ${url}`);
  };
}

/** Sets the server env for a Helius-enabled scan; returns a restore function. */
export function enableHelius() {
  process.env.ENABLE_HELIUS = "true";
  process.env.HELIUS_API_KEY = KEY;
  return () => {
    process.env.HELIUS_API_KEY = "";
  };
}
