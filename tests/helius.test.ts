import assert from "node:assert/strict";
import { test } from "node:test";
import { caseFileText } from "@/lib/analysis/caseFile";
import { clusterWallets } from "@/lib/analysis/clustering";
import { generateFindings } from "@/lib/analysis/findings";
import { clusterSignal, RELATIONSHIP_WEIGHTS } from "@/lib/analysis/relationshipSignal";
import { scanToken } from "@/lib/analysis/scanToken";
import { classifyMovement } from "@/lib/analysis/transactionFlow";
import { buildWalletGraph } from "@/lib/analysis/walletGraph";
import * as helius from "@/lib/providers/helius";
import type { Mass } from "@/lib/types/scan";
import { enableHelius, heliusHandler, KEY, makeWorld, POOL_AUTH, T0, tx } from "./heliusFixture";
import { addr, mockFetch } from "./helpers";

test("Helius disabled (ENABLE_HELIUS=false): every adapter returns { available: false } without a request", async () => {
  process.env.ENABLE_HELIUS = "false";
  process.env.HELIUS_API_KEY = KEY;
  const m = mockFetch(() => {
    throw new Error("must not fetch");
  });
  try {
    const mint = addr();
    for (const r of await Promise.all([
      helius.getTokenSupply(mint),
      helius.getLargestTokenAccounts(mint),
      helius.getTokenAccountOwners([mint]),
      helius.getWalletHistory(mint),
      helius.getWalletTransfers(mint),
      helius.getOriginalFunder(mint),
      helius.getWalletIdentity(mint),
      helius.getAuthorityInformation(mint),
      helius.getTokenTransactions(mint),
      helius.getOriginAnalysis(mint),
      helius.getAddressActivity(mint),
    ])) {
      assert.deepEqual(r, { available: false, reason: "not_configured" });
    }
    assert.equal(m.calls.length, 0);
  } finally {
    m.restore();
    process.env.ENABLE_HELIUS = "true";
    process.env.HELIUS_API_KEY = "";
  }
});

/** The linked-group world: W1-W3 share a private funder F (funded by the origin), W1 → W2 transfers, W4 funded from Binance, W5 is an exchange wallet. */
function linkedWorld() {
  const world = makeWorld();
  const [W1, W2, W3, W4, W5] = world.w;
  const { mint, origin: ORIGIN, funder: F, exchange: BINANCE } = world;
  return {
    world,
    handler: heliusHandler(world, {
      histories: () => ({
        [W1]: [tx(mint, "s-w1-buy", T0 + 10, [], [[POOL_AUTH, W1, 50e6]], "SWAP"), tx(mint, "s-w1w2-a", T0 + 400, [[W1, W2, 2e8]], []), tx(mint, "s-w1w2-b", T0 + 900, [[W1, W2, 1e8]], [])],
        [W2]: [tx(mint, "s-w2-buy", T0 + 20, [], [[POOL_AUTH, W2, 40e6]], "SWAP"), tx(mint, "s-w1w2-a", T0 + 400, [[W1, W2, 2e8]], [])],
        [W3]: [tx(mint, "s-w3-buy", T0 + 30, [], [[POOL_AUTH, W3, 30e6]], "SWAP")],
        [W4]: [tx(mint, "s-w4-buy", T0 + 5000, [], [[POOL_AUTH, W4, 20e6]], "SWAP")],
        [W5]: [],
        [ORIGIN]: [tx(mint, "s-origin-out", T0 + 2, [], [[ORIGIN, POOL_AUTH, 1e6]])],
        [mint]: [tx(mint, "s-big", T0 + 3000, [], [[W5, BINANCE, 80e6]])],
      }),
      funders: () => ({
        [W1]: { funder: F, timestamp: T0 - 100, signature: "f1", amount: 5e8 },
        [W2]: { funder: F, timestamp: T0 - 90, signature: "f2", amount: 5e8 },
        [W3]: { funder: F, timestamp: T0 - 80, signature: "f3", amount: 5e8 },
        [W4]: { funder: BINANCE, funderName: "Binance 8", funderType: "exchange", timestamp: T0 - 50, signature: "f4" },
        [F]: { funder: ORIGIN, timestamp: T0 - 500, signature: "ff" },
      }),
      identities: () => ({ [W5]: { name: "Binance Hot Wallet", type: "exchange" } }),
    }),
  };
}

test("Helius enabled, active trading token (fixtures): live scan, linked group found, exchange excluded, findings, no key leak", async () => {
  const restore = enableHelius();
  const { world, handler } = linkedWorld();
  const [W1, W2, W3, , W5] = world.w;
  const m = mockFetch(handler);
  try {
    const out = await scanToken(world.mint);
    assert.ok(out.ok);
    const r = out.result;
    assert.equal(r.mode, "live");
    assert.ok(r.sources.every((s) => s.status === "ok" || s.status === "empty"));
    assert.equal(r.genome.tokenProgram, "SPL");
    assert.equal(r.genome.mintAuthorityActive, false);
    assert.equal(r.genome.decimals, 6);

    // BRAIN
    assert.equal(r.brain.originAddress, world.origin);
    assert.equal(r.brain.originEvidence, "FIRST_TRANSACTION_SIGNER");
    assert.equal(r.brain.originLabel, "DEPLOYER");
    assert.equal(r.brain.originSupplyPercent, 2.4);
    assert.equal(r.brain.priorDeployments, 1, "NFTs and the token itself are not counted");
    assert.equal(r.brain.recentTokenMovements.length, 1);
    assert.equal(r.brain.recentTokenMovements[0].kind, "TRANSFER", "a transfer is never reported as a sell");

    // CELLS: the exchange wallet is labelled and removed from concentration.
    const ex = r.cells.holders.find((h) => h.address === W5);
    assert.equal(ex?.classification, "EXCHANGE");
    assert.equal(ex?.identity, "Binance Hot Wallet");
    assert.equal(r.cells.holders.find((h) => h.address === POOL_AUTH)?.classification, "POOL");
    assert.equal(r.cells.top1Percent, 5, "largest meaningful holder is W1 at 5%");
    assert.equal(r.cells.clusterSharePercent, 12);

    // MASS
    assert.equal(r.mass.heliusEnhanced, true);
    assert.equal(r.mass.analyzedWallets, 4, "exchange-identified holder excluded from the graph");
    assert.equal(r.mass.clusters.length, 1);
    const c = r.mass.clusters[0];
    assert.deepEqual(new Set(c.wallets), new Set([W1, W2, W3]));
    assert.equal(c.combinedSupplyPercent, 12);
    assert.deepEqual(c.commonFunders, [{ funder: world.funder, wallets: 3 }]);
    assert.equal(c.directTransfers, 2);
    assert.equal(c.repeatedInteractions, 1);
    assert.equal(c.originLinks, 3, "two-hop via the common funder");
    assert.deepEqual(c.synchronizedEntries, { wallets: 3, windowSeconds: 10 });
    assert.equal(c.relationshipSignal, 90);
    assert.deepEqual(c.signalBreakdown.map((b) => b.type).sort(), ["COMMON_FUNDER", "DIRECT_TRANSFER", "ORIGIN_PROXIMITY", "REPEATED_INTERACTION", "SYNCHRONIZED_ENTRY"]);
    assert.equal(r.mass.relationshipSignal, 90);

    // BLOODSTREAM
    assert.equal(r.bloodstream.majorMovements.length, 5, "four 2-5% buys + the 8% exchange transfer");
    assert.equal(r.bloodstream.majorMovements[0].signature, "s-big");
    assert.equal(r.bloodstream.majorMovements[0].kind, "TRANSFER");
    const buys = r.bloodstream.majorMovements.filter((mv) => mv.kind === "BUY");
    assert.equal(buys.length, 4);
    assert.deepEqual(buys.map((mv) => mv.actor), ["CLUSTER", "CLUSTER", "CLUSTER", "MAJOR_HOLDER"]);

    // FINDINGS → STATUS
    const labels = r.findings.map((f) => f.label);
    for (const l of ["MINT AUTHORITY REVOKED", "ORIGIN WALLET HOLDS 2.4%", "3 IMPORTANT HOLDERS SHARE A MEANINGFUL FUNDING SOURCE", "1 CONNECTED HOLDER CLUSTER DETECTED", "CONNECTED CLUSTERS HOLD 12.0% OF SUPPLY"]) assert.ok(labels.includes(l), l);
    assert.ok(labels.some((l) => /^MASS 01: 3 CONNECTED WALLETS HOLD 12\.0% · SIGNAL 90$/.test(l)));
    assert.equal(r.caseFile.statusCode, "ANOMALOUS_STRUCTURE_DETECTED");
    assert.deepEqual(r.coverage, { market: true, security: true, genome: true, liquidity: true, holders: true, origin: true, transactions: true, walletGraph: true, fundingAnalysis: true, walletIdentity: true });

    // CASE FILE
    const text = caseFileText(r);
    assert.match(text, /CASE {5}0XR-\d{5}/);
    assert.match(text, /FEED {5}LIVE/);
    assert.match(text, /FINDINGS\n· /);

    assert.equal(JSON.stringify(r).includes(KEY), false, "API key never appears in the result");
    assert.ok(m.calls.length < 90, `bounded call count (${m.calls.length})`);

    // Same token again: everything is served from cache.
    const before = m.calls.length;
    const again = await scanToken(world.mint);
    assert.ok(again.ok);
    assert.equal(m.calls.length - before, 0, "second scan makes no provider requests");
    assert.equal(again.result.caseFile.id, r.caseFile.id, "case id is deterministic");
    assert.ok(again.result.sources.some((s) => s.cached), "sources report the cache hit");
  } finally {
    m.restore();
    restore();
  }
});

test("Helius provider failure → PARTIAL scan with DexScreener + GoPlus data, no graph claims", async () => {
  const restore = enableHelius();
  const world = makeWorld();
  const m = mockFetch(heliusHandler(world, { heliusDown: true }));
  try {
    const out = await scanToken(world.mint);
    assert.ok(out.ok);
    const r = out.result;
    assert.equal(r.mode, "partial");
    assert.equal(r.heart.liquidityUsd, 150000);
    assert.ok(r.sources.some((s) => s.provider === "helius" && s.status === "error"));
    assert.equal(r.mass.heliusEnhanced, false);
    assert.equal(r.mass.clusters.length, 0);
    assert.equal(r.mass.relationshipSignal, null);
    assert.ok(r.findings.some((f) => f.label === "DEEP WALLET ANALYSIS NOT AVAILABLE · HELIUS DID NOT RESPOND"));
    assert.equal(r.caseFile.statusCode, "PARTIAL_SCAN");
  } finally {
    m.restore();
    restore();
  }
});

test("Helius plan without Enhanced / Wallet APIs → raw RPC fallback still finds funders, transfers and buys", async () => {
  const restore = enableHelius();
  const world = makeWorld();
  const [W1, W2, W3] = world.w;
  const F = world.funder;
  const RAYDIUM = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
  const buyTx = (w: string, amount: number, t: number) => ({
    blockTime: t,
    meta: {
      err: null,
      innerInstructions: [],
      preTokenBalances: [{ owner: POOL_AUTH, mint: world.mint, uiTokenAmount: { uiAmountString: "500000000" } }],
      postTokenBalances: [
        { owner: POOL_AUTH, mint: world.mint, uiTokenAmount: { uiAmountString: String(500e6 - amount) } },
        { owner: w, mint: world.mint, uiTokenAmount: { uiAmountString: String(amount) } },
      ],
    },
    transaction: { message: { accountKeys: [{ pubkey: w }], instructions: [{ programId: RAYDIUM, data: "x" }] } },
  });
  const fundTx = (w: string, t: number) => ({
    blockTime: t,
    meta: { err: null, innerInstructions: [], preTokenBalances: [], postTokenBalances: [] },
    transaction: { message: { accountKeys: [{ pubkey: F }], instructions: [{ program: "system", programId: "11111111111111111111111111111111", parsed: { type: "transfer", info: { source: F, destination: w, lamports: 500_000_000 } } }] } },
  });
  [[W1, 50e6], [W2, 40e6], [W3, 30e6]].forEach(([w, amt], i) => {
    world.rawTxs[`buy-${i}`] = buyTx(w as string, amt as number, T0 + 10 + i * 5);
    world.rawTxs[`fund-${i}`] = fundTx(w as string, T0 - 100 + i);
    world.sigs[w as string] = [{ signature: `buy-${i}`, blockTime: T0 + 10 + i * 5 }, { signature: `fund-${i}`, blockTime: T0 - 100 + i }];
  });
  const m = mockFetch(heliusHandler(world, { noEnhancedApi: true, noWalletApi: true }));
  try {
    const out = await scanToken(world.mint);
    assert.ok(out.ok);
    const r = out.result;
    assert.equal(r.mode, "live", "a plan limitation is not a provider failure");
    assert.equal(r.coverage.fundingAnalysis, true);
    assert.equal(r.coverage.walletIdentity, false, "identity has no RPC fallback");
    assert.ok(r.sources.some((s) => s.note === "identity not on this Helius plan"));
    const node = r.mass.nodes.find((n) => n.wallet === W1);
    assert.equal(node?.funder, F, "funder traced from the oldest transaction");
    assert.equal(node?.firstTokenInteraction, T0 + 10, "entry rebuilt from token balance changes");
    assert.equal(r.mass.clusters.length, 1);
    assert.deepEqual(new Set(r.mass.clusters[0].wallets), new Set([W1, W2, W3]));
    assert.ok(r.bloodstream.majorMovements.some((mv) => mv.kind === "BUY" && mv.to === W1), "swap through a pool program reads as a BUY");
  } finally {
    m.restore();
    restore();
  }
});

test("Wallet API placeholder labels (\"unknown\", domains) leave ordinary holders in the graph", async () => {
  const restore = enableHelius();
  const world = makeWorld();
  const [W1, W2, W3, W4, W5] = world.w;
  const F = world.funder;
  const blank = (w: string) => ({ address: w, type: "unknown", name: "Unknown", category: "Unknown", tags: [] });
  const m = mockFetch(
    heliusHandler(world, {
      identities: () => ({ [W1]: blank(W1), [W2]: blank(W2), [W3]: { address: W3, type: "wallet", name: "bundler.sol", category: "", tags: [], domainNames: ["bundler.sol"] }, [W4]: blank(W4), [W5]: blank(W5) }),
      funders: () => ({
        [W1]: { funder: F, funderName: null, funderType: "unknown", signature: "a", amount: 0.5 },
        [W2]: { funder: F, funderName: null, funderType: "unknown", signature: "b", amount: 0.5 },
        [W3]: { funder: F, funderName: null, funderType: null, signature: "c", amount: 0.5 },
      }),
    }),
  );
  try {
    const out = await scanToken(world.mint);
    assert.ok(out.ok);
    const r = out.result;
    assert.equal(r.mass.analyzedWallets, 5, "every ordinary holder is traced");
    assert.notEqual(r.mass.graphState, "INSUFFICIENT_GRAPH_DATA");
    assert.ok(r.mass.nodes.every((n) => n.classification === "UNKNOWN" && n.identity === null));
    assert.ok(r.cells.holders.every((h) => h.identity === null), "no placeholder or domain shown as an identity");
    assert.equal(r.mass.clusters.length, 1, "an unlabelled shared funder still links wallets");
    assert.deepEqual(new Set(r.mass.clusters[0].wallets), new Set([W1, W2, W3]));
  } finally {
    m.restore();
    restore();
  }
});

test("classifyIdentity: placeholders stay UNKNOWN, real labels classify", () => {
  for (const l of ["unknown", "Unknown", "wallet", "user", "N/A", "", "toly.sol"]) assert.equal(helius.classifyIdentity(l), "UNKNOWN", l);
  assert.equal(helius.classifyIdentity("exchange", "Coinbase 2"), "CENTRALIZED_EXCHANGE");
  assert.equal(helius.classifyIdentity("unknown", "Jupiter Aggregator"), "DEX");
  assert.equal(helius.classifyIdentity("Magic Eden"), "KNOWN_SERVICE");
});

test("MASS with no cluster: a shared but service-like funder is a withdrawal source, not a link", async () => {
  const restore = enableHelius();
  const world = makeWorld();
  const [W1, W2, W3] = world.w;
  const S = addr();
  const m = mockFetch(
    heliusHandler(world, {
      funders: () => ({ [W1]: { funder: S, signature: "a" }, [W2]: { funder: S, signature: "b" }, [W3]: { funder: S, signature: "c" } }),
      activity: () => ({ [S]: 1000 }),
    }),
  );
  try {
    const out = await scanToken(world.mint);
    assert.ok(out.ok);
    const r = out.result;
    assert.equal(r.mass.graphState, "NO_RELATIONSHIPS");
    assert.equal(r.mass.clusters.length, 0);
    assert.equal(r.mass.relationshipSignal, 0);
    assert.ok(r.mass.edges.every((e) => e.relationshipType !== "COMMON_FUNDER"));
    const labels = r.findings.map((f) => f.label);
    assert.ok(labels.some((l) => l.startsWith("NO CONNECTED HOLDER CLUSTERS DETECTED")));
    assert.ok(labels.includes("COMMON FUNDER IS A HIGH-ACTIVITY SERVICE ADDRESS · 3 HOLDERS · COMMON WITHDRAWAL SOURCE"));
    assert.equal(r.caseFile.statusCode, "NO_MAJOR_STRUCTURAL_FLAGS_DETECTED");
    assert.equal(r.caseFile.verdict.label, "FEW RED FLAGS FOUND");
    assert.match(r.caseFile.verdict.summary, /not a guarantee/);
  } finally {
    m.restore();
    restore();
  }
});

const mass = (g: ReturnType<typeof buildWalletGraph>): Mass => {
  const clusters = clusterWallets(g.nodes, g.edges, null);
  return { heliusEnhanced: true, analyzedWallets: g.nodes.length, nodes: g.nodes, edges: g.edges, clusters, relationshipSignal: null, graphState: clusters.length ? "ENHANCED" : "NO_RELATIONSHIPS" };
};

test("common funder identified as an exchange → COMMON WITHDRAWAL SOURCE only, never a cluster", () => {
  const mint = addr();
  const [a, b, c] = [addr(), addr(), addr()];
  const cex = { funder: addr(), funderName: "Coinbase 4", funderClass: "CENTRALIZED_EXCHANGE" as const, timestamp: 1, signature: "x", amountSol: 1 };
  const g = buildWalletGraph({ mint, origin: null, wallets: [a, b, c].map((w) => ({ wallet: w, balance: 1, supplyPercent: 3, identity: null, funder: cex, transfers: [] })) });
  assert.ok(g.edges.length > 0 && g.edges.every((e) => e.relationshipType === "COMMON_WITHDRAWAL_SOURCE"));
  const ms = mass(g);
  assert.equal(ms.clusters.length, 0);
  const findings = generateFindings({ mode: "live", marketListed: true, genome: {} as never, heart: { liquidityUsd: null, liquidityMarketCapRatio: null, poolAgeSeconds: null, lpStatus: null } as never, brain: { recentTokenMovements: [], authorityLinks: [] } as never, cells: { holders: [], lowerBounds: [], top1Percent: null, top10Percent: null, clusterSharePercent: 0 } as never, bloodstream: { movementsTraced: true, majorMovements: [], buys24h: null, sells24h: null } as never, mass: ms, sources: [] });
  assert.ok(findings.some((f) => f.label === "COMMON FUNDER IS A KNOWN EXCHANGE · 3 HOLDERS · COMMON WITHDRAWAL SOURCE"));
  assert.equal(findings.some((f) => f.code === "COMMON_FUNDER"), false);
});

test("direct wallet relationship → DIRECT_TRANSFER edge with full evidence, and a cluster", () => {
  const mint = addr();
  const [a, b, c] = [addr(), addr(), addr()];
  const t = { signature: "sig-direct", timestamp: 1234, txType: "TRANSFER", asset: mint, from: a, to: b, amount: 5000 };
  const g = buildWalletGraph({
    mint,
    origin: null,
    wallets: [
      { wallet: a, balance: 1, supplyPercent: 4, identity: null, funder: null, transfers: [t] },
      { wallet: b, balance: 1, supplyPercent: 3, identity: null, funder: null, transfers: [t] },
      { wallet: c, balance: 1, supplyPercent: 2, identity: null, funder: null, transfers: [] },
    ],
  });
  const direct = g.edges.filter((e) => e.relationshipType === "DIRECT_TRANSFER");
  assert.equal(direct.length, 1, "the same transfer seen from both sides counts once");
  assert.deepEqual(direct[0].evidence, { signature: "sig-direct", asset: mint, amount: 5000, source: a, destination: b });
  assert.equal(direct[0].timestamp, 1234);
  const clusters = clusterWallets(g.nodes, g.edges, null);
  assert.equal(clusters.length, 1);
  assert.deepEqual(new Set(clusters[0].wallets), new Set([a, b]));
  assert.equal(clusters[0].combinedSupplyPercent, 7);
  assert.equal(clusters[0].relationshipSignal, 50);
});

test("synchronized entry alone never forms a MASS", () => {
  const mint = addr();
  const ws = [addr(), addr(), addr()];
  const g = buildWalletGraph({
    mint,
    origin: null,
    wallets: ws.map((w, i) => ({ wallet: w, balance: 1, supplyPercent: 2, identity: null, funder: null, transfers: [{ signature: `s${i}`, timestamp: 100 + i * 5, txType: "SWAP", asset: mint, from: addr(), to: w, amount: 1 }] })),
  });
  assert.equal(g.edges.filter((e) => e.relationshipType === "SYNCHRONIZED_ENTRY").length, 2);
  assert.equal(clusterWallets(g.nodes, g.edges, null).length, 0);
});

test("insufficient graph: fewer than 3 wallets → not sufficient", () => {
  const g = buildWalletGraph({ mint: addr(), origin: null, wallets: [{ wallet: addr(), balance: 1, supplyPercent: 1, identity: null, funder: null, transfers: [] }] });
  assert.equal(g.sufficient, false);
});

test("relationship signal is deterministic, capped, and null without a cluster", () => {
  assert.equal(clusterSignal([addr()], []), null);
  const [a, b] = [addr(), addr()];
  const all = Object.keys(RELATIONSHIP_WEIGHTS).map((t) => ({ from: a, to: b, relationshipType: t as never, timestamp: null, evidence: {}, strength: 0 }));
  const s = clusterSignal([a, b], all)!;
  assert.ok(s <= 100 && s >= 90);
  assert.equal(clusterSignal([a, b], all), s);
});

test("movement classification: swaps by direction, transfers stay transfers", () => {
  const pool = addr();
  const w = addr();
  const pools = new Set([pool]);
  assert.equal(classifyMovement("SWAP", w, pool, w, pools), "BUY");
  assert.equal(classifyMovement("SWAP", w, w, pool, pools), "SELL");
  assert.equal(classifyMovement("TRANSFER", w, w, addr(), pools), "TRANSFER");
  assert.equal(classifyMovement("TRANSFER", w, w, pool, pools), "TRANSFER", "sending to a pool without a swap is not a sell");
  assert.equal(classifyMovement("ADD_LIQUIDITY", w, w, pool, pools), "LIQUIDITY");
  assert.equal(classifyMovement(null, null, addr(), addr(), pools), "UNKNOWN");
});
