import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDexPairs } from "@/lib/providers/dexscreener";
import { normalizeGoPlus } from "@/lib/providers/goplus";
import { addr, dexPairs, goplusBody } from "./helpers";

test("DexScreener fixture normalizes market fields and drops unsafe links", () => {
  const mint = addr();
  const m = normalizeDexPairs(mint, dexPairs(mint, { liquidity: 90000 }))!;
  assert.equal(m.symbol, "FIX");
  assert.equal(m.liquidityUsd, 90000);
  assert.equal(m.buys24h, 1200);
  assert.equal(m.sells24h, 1000);
  assert.equal(m.volume24h, 250000);
  assert.equal(m.primary?.dexId, "raydium");
  assert.ok(m.firstPairAt && m.firstPairAt > 0);
  assert.equal(m.socials.length, 1, "javascript: link must be dropped");
});

test("DexScreener: pairs where the token is only the quote asset are ignored", () => {
  const mint = addr();
  const other = addr();
  assert.equal(normalizeDexPairs(mint, dexPairs(other)), null);
  assert.equal(normalizeDexPairs(mint, []), null);
  assert.equal(normalizeDexPairs(mint, { pairs: null }), null);
});

test("GoPlus fixture normalizes authorities and holder percent scale", () => {
  const mint = addr();
  const w1 = addr();
  const w2 = addr();
  const g = normalizeGoPlus(mint, goplusBody(mint, { mintable: "1", holders: [{ account: w1, percent: "0.071" }, { account: w2, percent: "0.05" }] }))!;
  assert.equal(g.mintAuthorityActive, true);
  assert.equal(g.freezeAuthorityActive, false);
  assert.equal(g.holderCount, 1842);
  assert.equal(g.holders[0].owner, w1);
  assert.ok(Math.abs((g.holders[0].percent ?? 0) - 7.1) < 1e-9, "fractional percent becomes 0-100");
  assert.equal(g.transferHook, false);
  assert.equal(g.defaultAccountState, "INITIALIZED");
});

test("GoPlus: empty / malformed body yields null, not defaults", () => {
  const mint = addr();
  assert.equal(normalizeGoPlus(mint, { code: 1, result: {} }), null);
  assert.equal(normalizeGoPlus(mint, null), null);
  const g = normalizeGoPlus(mint, { code: 1, result: { [mint]: { holders: [] } } })!;
  assert.equal(g.mintAuthorityActive, null);
  assert.equal(g.holderCount, null);
  assert.equal(g.totalSupply, null);
});
