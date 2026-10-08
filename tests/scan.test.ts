import assert from "node:assert/strict";
import { test } from "node:test";
import { caseFileText } from "@/lib/analysis/caseFile";
import { scanToken } from "@/lib/analysis/scanToken";
import { addr, dexPairs, goplusBody, mockFetch, status } from "./helpers";

const isDex = (u: string) => u.startsWith("https://api.dexscreener.com/");
const isGoPlus = (u: string) => u.startsWith("https://api.gopluslabs.io/");

test("missing Helius key: scan still works on DexScreener + GoPlus → PARTIAL, Helius never called, no invented graph", async () => {
  assert.equal(process.env.ENABLE_HELIUS, "true");
  assert.equal(process.env.HELIUS_API_KEY, "");
  const mint = addr();
  const pool = addr();
  const w = [addr(), addr(), addr()];
  const m = mockFetch((u) => {
    if (isDex(u)) return dexPairs(mint, { pair: pool });
    if (isGoPlus(u)) return goplusBody(mint, { holders: [{ account: pool, percent: "0.22" }, { account: w[0], percent: "0.071" }, { account: w[1], percent: "0.04" }, { account: w[2], percent: "0.02" }] });
    throw new Error(`unexpected ${u}`);
  });
  try {
    const out = await scanToken(mint);
    assert.ok(out.ok);
    const r = out.result;
    assert.equal(r.mode, "partial");
    assert.equal(m.calls.some((c) => c.includes("helius")), false);
    assert.deepEqual(r.sources.find((s) => s.provider === "helius"), { provider: "helius", scope: "deep analysis", status: "not_configured", fetchedAt: null, cached: false, note: "not configured" });
    assert.equal(r.caseFile.statusCode, "PARTIAL_SCAN");
    assert.ok(r.findings.some((f) => f.label === "DEEP WALLET ANALYSIS NOT AVAILABLE · HELIUS NOT CONFIGURED"));
    assert.equal(r.caseFile.verdict.level, "NOT_ENOUGH_DATA", "a partial scan with nothing flagged is not called clean");
    assert.ok(r.findings.some((f) => f.label === "TOP 10 HOLDERS CONTROL ≥13.1%"), "lower bound marked");
    assert.ok(r.findings.some((f) => f.label === "LARGEST HOLDER CONTROLS 7.1%"));
    assert.equal(r.heart.liquidityUsd, 90000);
    assert.equal(r.cells.holderCount, 1842);
    assert.equal(r.cells.holders.find((h) => h.address === pool)?.classification, "POOL");
    assert.ok(Math.abs((r.cells.top1Percent ?? 0) - 7.1) < 1e-9, "pool excluded from concentration");
    assert.deepEqual(r.cells.lowerBounds, ["top5", "top10", "top20"]);
    assert.equal(r.mass.heliusEnhanced, false);
    assert.equal(r.mass.graphState, "NOT_ENABLED");
    assert.equal(r.mass.clusters.length, 0);
    assert.equal(r.mass.relationshipSignal, null);
    assert.equal(r.brain.priorDeployments, null);
    assert.equal(r.bloodstream.majorMovements.length, 0);
    assert.equal(r.bloodstream.movementsTraced, false);
    assert.equal(r.genome.tokenProgram, null, "GoPlus alone cannot establish the program");
    assert.match(r.caseFile.id, /^0XR-\d{5}$/);
    const again = await scanToken(mint);
    assert.ok(again.ok && again.result.caseFile.id === r.caseFile.id, "case id is deterministic");
  } finally {
    m.restore();
  }
});

test("token without a market: GoPlus only → NO LIQUIDITY PAIR FOUND, market fields null", async () => {
  const mint = addr();
  const m = mockFetch((u) => (isDex(u) ? [] : goplusBody(mint, { holders: [{ account: addr(), percent: "0.3" }] })));
  try {
    const out = await scanToken(mint);
    assert.ok(out.ok);
    assert.equal(out.result.heart.liquidityUsd, null);
    assert.equal(out.result.bloodstream.buys24h, null);
    assert.equal(out.result.token.priceUsd, null);
    assert.ok(out.result.findings.some((f) => f.label === "NO LIQUIDITY PAIR FOUND"));
    assert.match(caseFileText(out.result), /Liquidity \.+ —/);
  } finally {
    m.restore();
  }
});

test("DexScreener failure → PARTIAL, market nulls, never example values", async () => {
  const mint = addr();
  const m = mockFetch((u) => (isDex(u) ? status(502) : goplusBody(mint, { holders: [{ account: addr(), percent: "0.1" }] })));
  try {
    const out = await scanToken(mint);
    assert.ok(out.ok);
    assert.equal(out.result.mode, "partial");
    assert.equal(out.result.heart.liquidityUsd, null);
    assert.equal(out.result.caseFile.statusCode, "PARTIAL_SCAN");
    assert.equal(out.result.sources.find((s) => s.provider === "dexscreener")?.note, "responded 502");
    const text = JSON.stringify(out.result);
    assert.equal(text.includes("184291") || text.includes("612487"), false);
  } finally {
    m.restore();
  }
});

test("GoPlus failure → PARTIAL with holders and genome unknown", async () => {
  const mint = addr();
  const m = mockFetch((u) => {
    if (isDex(u)) return dexPairs(mint);
    throw new Error("connection reset");
  });
  try {
    const out = await scanToken(mint);
    assert.ok(out.ok);
    assert.equal(out.result.mode, "partial");
    assert.equal(out.result.cells.holderCount, null);
    assert.equal(out.result.cells.holders.length, 0);
    assert.equal(out.result.genome.mintAuthorityActive, null);
    assert.equal(out.result.heart.liquidityUsd, 90000);
  } finally {
    m.restore();
  }
});

test("both providers down → PROVIDER_UNAVAILABLE (503); nothing known → TOKEN_NOT_FOUND (404)", async () => {
  const a = addr();
  let m = mockFetch(() => status(503));
  try {
    const out = await scanToken(a);
    assert.equal(out.ok, false);
    assert.ok(!out.ok && out.code === "PROVIDER_UNAVAILABLE" && out.status === 503);
  } finally {
    m.restore();
  }
  const b = addr();
  m = mockFetch((u) => (isDex(u) ? [] : { code: 1, result: {} }));
  try {
    const out = await scanToken(b);
    assert.ok(!out.ok && out.code === "TOKEN_NOT_FOUND" && out.status === 404);
  } finally {
    m.restore();
  }
});

test("low-liquidity token: thin pool relative to market cap, new pool", async () => {
  const mint = addr();
  const m = mockFetch((u) => (isDex(u) ? dexPairs(mint, { liquidity: 9000, mcap: 900000 }) : goplusBody(mint, { holders: [{ account: addr(), percent: "0.05" }] })));
  try {
    const out = await scanToken(mint);
    assert.ok(out.ok);
    const labels = out.result.findings.map((f) => f.label);
    assert.ok(labels.includes("LIQUIDITY $9,000 IS BELOW $10,000"));
    assert.ok(labels.includes("LOW LIQUIDITY RELATIVE TO MARKET CAP · 1.0%"));
    assert.ok(labels.includes("NEW LIQUIDITY POOL · 6H OLD"));
    assert.equal(out.result.caseFile.statusCode, "LOW_LIQUIDITY");
    assert.equal(out.result.caseFile.verdict.level, "SOME_RED_FLAGS");
  } finally {
    m.restore();
  }
});

test("strong market depth is reported from the documented thresholds", async () => {
  const mint = addr();
  const m = mockFetch((u) => (isDex(u) ? dexPairs(mint, { liquidity: 400000, mcap: 2000000 }) : goplusBody(mint)));
  try {
    const out = await scanToken(mint);
    assert.ok(out.ok);
    const labels = out.result.findings.map((f) => f.label);
    assert.ok(labels.includes("STRONG MARKET DEPTH · $400,000"));
    assert.ok(labels.includes("LIQUIDITY REPRESENTS 20.0% OF MARKET CAP"));
  } finally {
    m.restore();
  }
});

test("status engine flags active authority and concentration from observed data", async () => {
  const mint = addr();
  const m = mockFetch((u) =>
    isDex(u) ? dexPairs(mint, { liquidity: 4000 }) : goplusBody(mint, { mintable: "1", freezable: "1", holders: [{ account: addr(), percent: "0.31" }, { account: addr(), percent: "0.2" }] }),
  );
  try {
    const out = await scanToken(mint);
    assert.ok(out.ok);
    const codes = out.result.caseFile.flags.map((f) => f.code);
    assert.equal(out.result.caseFile.statusCode, "PRIVILEGED_AUTHORITY_ACTIVE");
    assert.ok(codes.includes("HIGH_HOLDER_CONCENTRATION"));
    assert.ok(codes.includes("LOW_LIQUIDITY"));
    assert.ok(out.result.findings.some((f) => f.label === "TOP 10 HOLDERS CONTROL ≥51.0%"));
    assert.ok(out.result.findings.some((f) => f.label === "MINT AUTHORITY ACTIVE"));
    assert.equal(out.result.caseFile.verdict.label, "SERIOUS RED FLAGS");
    assert.ok(out.result.caseFile.verdict.reasons.includes("MINT AUTHORITY ACTIVE"));
    for (const f of [...out.result.caseFile.flags, ...out.result.findings]) assert.doesNotMatch(f.label, /SAFE|SCAM|RUG|GUARANTEE|WILL /);
  } finally {
    m.restore();
  }
});
