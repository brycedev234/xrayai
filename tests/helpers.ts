/**
 * Test helpers. Everything here is a FIXTURE: shapes modelled on the public
 * DexScreener / GoPlus / Helius responses, not live data.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function encodeBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (const b of bytes) {
    let carry = b;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return "1".repeat(zeros) + digits.reverse().map((d) => ALPHABET[d]).join("");
}

let counter = 1;
/** Deterministic, valid, unique Solana-style address for fixtures. */
export function addr(): string {
  const bytes = new Uint8Array(32);
  let x = counter++ * 2654435761;
  for (let i = 0; i < 32; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    bytes[i] = (x >>> 16) & 0xff;
  }
  bytes[0] = bytes[0] | 1;
  return encodeBase58(bytes);
}

type Handler = (url: string, init?: RequestInit) => unknown | Promise<unknown>;

/** Replaces global fetch. Handlers return a JSON body, a Response, or throw to simulate a network failure. */
export function mockFetch(handler: Handler) {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    const out = await handler(url, init);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

export const status = (code: number) => new Response("{}", { status: code });

export function dexPairs(mint: string, opts: { pair?: string; liquidity?: number; mcap?: number } = {}) {
  return [
    {
      chainId: "solana",
      dexId: "raydium",
      url: "https://dexscreener.com/solana/x",
      pairAddress: opts.pair ?? addr(),
      baseToken: { address: mint, name: "Fixture Token", symbol: "FIX" },
      quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
      priceUsd: "0.000412",
      txns: { m5: { buys: 3, sells: 1 }, h1: { buys: 40, sells: 35 }, h6: { buys: 300, sells: 280 }, h24: { buys: 1200, sells: 1000 } },
      volume: { h24: 250000, h6: 80000, h1: 12000, m5: 900 },
      priceChange: { m5: 0.4, h1: -1.2, h6: 3.1, h24: 8.5 },
      liquidity: { usd: opts.liquidity ?? 90000, base: 1, quote: 1 },
      fdv: opts.mcap ?? 412000,
      marketCap: opts.mcap ?? 412000,
      pairCreatedAt: Date.now() - 6 * 3600 * 1000,
      info: { imageUrl: "https://cdn.example/img.png", websites: [{ label: "Website", url: "https://fixture.example" }], socials: [{ type: "twitter", url: "https://x.com/fixture" }, { type: "bad", url: "javascript:alert(1)" }] },
    },
  ];
}

export function goplusBody(mint: string, opts: { holders?: { account: string; percent: string; tag?: string; is_locked?: number }[]; mintable?: string; freezable?: string; holderCount?: string } = {}) {
  return {
    code: 1,
    message: "OK",
    result: {
      [mint]: {
        mintable: { status: opts.mintable ?? "0", authority: [] },
        freezable: { status: opts.freezable ?? "0", authority: [] },
        closable: { status: "0", authority: [] },
        metadata_mutable: { status: "0", metadata_upgrade_authority: [] },
        balance_mutable_authority: { status: "0", authority: [] },
        transfer_hook: [],
        transfer_fee: {},
        default_account_state: "1",
        non_transferable: "0",
        total_supply: "1000000000",
        holder_count: opts.holderCount ?? "1842",
        holders: (opts.holders ?? []).map((h) => ({ account: h.account, token_account: addr(), balance: String(Number(h.percent) * 1e9), percent: h.percent, is_locked: h.is_locked ?? 0, tag: h.tag ?? "" })),
        lp_holders: [],
        creators: [],
        metadata: { name: "Fixture Token", symbol: "FIX", uri: "" },
        dex: [{ dex_name: "Raydium", burn_percent: "1" }],
      },
    },
  };
}
