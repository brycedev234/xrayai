/**
 * Scan pipeline. One function, explicit steps, no hidden fallbacks.
 *
 *   1  VALIDATE ADDRESS              route: lib/validation (real 32-byte Solana key)
 *   2  FETCH MARKET DATA             DexScreener                       ┐
 *   3  FETCH TOKEN / MINT CONFIG     GoPlus + Helius mint account      │ first wave,
 *      (also started here)           Helius largest accounts, origin   │ concurrent
 *                                    trace, mint transactions          ┘
 *   4  ANALYZE LIQUIDITY             liquidityAnalysis.ts
 *   5  ANALYZE HOLDERS               owners resolved (Helius), pools / burn / programs excluded
 *   6  ANALYZE ORIGIN / AUTHORITIES  originAnalysis.ts                 ┐ second wave,
 *   8  ANALYZE IMPORTANT HOLDERS     funder + identity + history ×20   ┘ concurrent
 *   7  ANALYZE TRANSACTION FLOW      transactionFlow.ts (mint, origin and holder movements)
 *   9  BUILD WALLET RELATIONSHIP GRAPH  walletGraph.ts
 *  10  BUILD HOLDER CLUSTERS         clustering.ts
 *  11  GENERATE FINDINGS             findings.ts
 *  12  GENERATE CASE FILE            statusEngine.ts + caseFile.ts
 *
 * Mode: LIVE when DexScreener, GoPlus and Helius all answered; PARTIAL when
 * any of them failed or Helius is not configured. This function never
 * produces demo data.
 */

import { features, heliusState } from "@/config/features";
import { MASS } from "@/config/thresholds";
import { fetchMarket } from "../providers/dexscreener";
import { fetchSecurity } from "../providers/goplus";
import * as helius from "../providers/helius";
import type { FunderInfo, HeliusResult, WalletIdentity } from "../providers/helius";
import type { Coverage, Mass, ScanErrorCode, ScanResult, SourceResult } from "../types/scan";
import { caseId } from "./caseFile";
import { clusterWallets } from "./clustering";
import { generateFindings } from "./findings";
import { buildCells } from "./holderAnalysis";
import { POOL_INFRASTRUCTURE } from "./knownAddresses";
import { buildHeart } from "./liquidityAnalysis";
import { buildBrain, pickOrigin } from "./originAnalysis";
import { evaluateStatus, evaluateVerdict } from "./statusEngine";
import { buildGenome } from "./tokenGenome";
import { buildBloodstream, majorMovements, mintMovements, walletMovements, type FlowContext } from "./transactionFlow";
import { buildWalletGraph, INFRA_CLASSES, type GraphWalletInput } from "./walletGraph";

/** Holders traced by the wallet graph (config/thresholds.ts). */
export const GRAPH_WALLET_LIMIT = MASS.graphWalletLimit;

export type ScanOutcome = { ok: true; result: ScanResult } | { ok: false; status: number; code: ScanErrorCode; message: string };

const data = <T>(r: HeliusResult<T> | null | undefined): T | null => (r && r.available ? r.data : null);

function heliusSource(scope: string, results: (HeliusResult<unknown> | null | undefined)[]): SourceResult {
  const present = results.filter((r): r is HeliusResult<unknown> => Boolean(r));
  const failed = present.filter((r) => !r.available && r.reason === "error").length;
  const unsupported = present.filter((r) => !r.available && r.reason === "unsupported").length;
  return {
    provider: "helius",
    scope,
    status: failed ? "error" : present.some((r) => r.available) ? "ok" : "empty",
    fetchedAt: new Date().toISOString(),
    cached: false,
    note: failed ? `${failed} of ${present.length} lookups failed` : unsupported ? "identity not on this Helius plan" : undefined,
  };
}

/**
 * Shared funders with no label get a second look: a Helius identity lookup,
 * then an activity check. Exchange / service-like funders become
 * infrastructure so they produce COMMON WITHDRAWAL SOURCE, not COMMON FUNDER.
 */
async function classifySharedFunders(inputs: GraphWalletInput[]): Promise<Map<string, Pick<FunderInfo, "funderClass" | "funderName">>> {
  const counts = new Map<string, number>();
  for (const i of inputs) if (i.funder && i.funder.funderClass === "UNKNOWN") counts.set(i.funder.funder, (counts.get(i.funder.funder) ?? 0) + 1);
  const shared = [...counts].filter(([, n]) => n >= 2).map(([f]) => f).slice(0, MASS.originIntermediaryLimit);
  const out = new Map<string, Pick<FunderInfo, "funderClass" | "funderName">>();
  await Promise.all(
    shared.map(async (f) => {
      const [id, activity] = await Promise.all([helius.getWalletIdentity(f), helius.getAddressActivity(f)]);
      const identity = data(id);
      if (identity && identity.classification !== "UNKNOWN") {
        out.set(f, { funderClass: identity.classification, funderName: identity.name });
        return;
      }
      const a = data(activity);
      if (a && a.recentSignatures >= MASS.serviceFunderSignatures && a.spanSeconds !== null && a.spanSeconds <= MASS.serviceFunderSpanSeconds) {
        out.set(f, { funderClass: "KNOWN_SERVICE", funderName: "HIGH-ACTIVITY ADDRESS" });
      }
    }),
  );
  return out;
}

export async function scanToken(address: string, opts: { now?: number } = {}): Promise<ScanOutcome> {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const heliusOn = features.helius;

  /* Steps 2-3 (first wave): everything that only needs the mint address. */
  const [marketRes, securityRes, mintRes, largestRes, originRes, mintTxsRes] = await Promise.all([
    fetchMarket(address),
    fetchSecurity(address),
    heliusOn ? helius.getAuthorityInformation(address) : null,
    heliusOn ? helius.getLargestTokenAccounts(address) : null,
    heliusOn ? helius.getOriginAnalysis(address) : null,
    heliusOn ? helius.getTokenTransactions(address) : null,
  ]);

  const market = marketRes.data;
  const security = securityRes.data;
  const mint = data(mintRes);

  const marketFailed = marketRes.source.status === "error";
  const securityFailed = securityRes.source.status === "error";
  const mintMissing = heliusOn && mintRes?.available === false && mintRes.reason === "not_found";

  if (!market && !security && !mint) {
    if (mintMissing && !marketFailed) {
      return { ok: false, status: 404, code: "TOKEN_NOT_FOUND", message: "This address is not a token mint." };
    }
    if (marketFailed && securityFailed) {
      return { ok: false, status: 503, code: "PROVIDER_UNAVAILABLE", message: "Market and security providers did not respond. Retry shortly." };
    }
    if (!marketFailed && !securityFailed) {
      return { ok: false, status: 404, code: "TOKEN_NOT_FOUND", message: "No market or token record found for this mint." };
    }
    return { ok: false, status: 503, code: "PROVIDER_UNAVAILABLE", message: "Not enough providers responded to scan this token. Retry shortly." };
  }

  /* Step 3: genome. Step 4: liquidity. */
  const genome = buildGenome(security, mint);
  const heart = buildHeart(market, security, now);

  /* Step 5: holders. Token accounts → owners in two batched calls. */
  const largest = data(largestRes);
  const ownersRes = largest?.length ? await helius.getTokenAccountOwners(largest.map((a) => a.tokenAccount)) : null;
  const owners = data(ownersRes);
  const supply = mint?.supply ?? security?.totalSupply ?? null;

  const originInfo = data(originRes);
  const { originAddress } = pickOrigin(security, mint, originInfo);
  const holderInputs = {
    security,
    market,
    helius: largest && owners && mint?.supply ? { largest, owners, supply: mint.supply } : null,
    origin: originAddress,
  };
  let cells = buildCells(holderInputs);

  /* Steps 6 + 8 (second wave, Helius): origin detail and important-holder intel, concurrently. */
  const candidates = cells.holders
    .filter((h) => h.classification === "WALLET" || h.classification === "ORIGIN" || h.classification === "LOCKED")
    .slice(0, GRAPH_WALLET_LIMIT);

  const [originBalanceRes, relatedRes, originHistoryRes, intel] = heliusOn
    ? await Promise.all([
        originAddress ? helius.getOwnerTokenBalance(originAddress, address) : null,
        originAddress ? helius.getAssetsByAuthority(originAddress) : null,
        originAddress ? helius.getWalletTransfers(originAddress) : null,
        candidates.length ? helius.getWalletIntel(candidates.map((c) => c.address)) : Promise.resolve([]),
      ])
    : [null, null, null, []];

  /* Identities re-label exchange / infrastructure holders and remove them from concentration. */
  const identities = new Map<string, WalletIdentity>();
  for (const w of intel) {
    const id = data(w.identity);
    if (id) identities.set(w.wallet, id);
  }
  if (identities.size) cells = buildCells({ ...holderInputs, identities });

  /* Steps 9-10: wallet graph over unidentified important holders, then clusters. */
  let mass: Mass = { heliusEnhanced: false, analyzedWallets: 0, nodes: [], edges: [], clusters: [], relationshipSignal: null, graphState: "NOT_ENABLED" };
  const heliusAnswered = Boolean(mintRes?.available || largestRes?.available || originRes?.available || mintTxsRes?.available);
  if (heliusOn && !heliusAnswered) {
    mass = { ...mass, graphState: "INSUFFICIENT_GRAPH_DATA" };
  } else if (heliusOn) {
    const byAddress = new Map(candidates.map((c) => [c.address, c]));
    // Graph the same holders that count toward concentration: only wallets an
    // identity moved out of it (exchange, DEX, protocol, bridge) are left out.
    const finalClass = new Map(cells.holders.map((h) => [h.address, h.classification]));
    let inputs: GraphWalletInput[] = intel
      .filter((w) => {
        const cls = finalClass.get(w.wallet);
        return !cls || cls === "WALLET" || cls === "ORIGIN" || cls === "LOCKED";
      })
      .map((w) => ({
        wallet: w.wallet,
        balance: byAddress.get(w.wallet)?.amount ?? null,
        supplyPercent: byAddress.get(w.wallet)?.percent ?? null,
        identity: data(w.identity),
        funder: data(w.funder),
        transfers: data(w.transfers),
      }));

    const sharedFunders = await classifySharedFunders(inputs);
    inputs = inputs.map((i) => (i.funder && sharedFunders.has(i.funder.funder) ? { ...i, funder: { ...i.funder, ...sharedFunders.get(i.funder.funder)! } } : i));

    // Two-hop origin proximity: who funded the (unidentified) funders.
    const funders = [...new Set(inputs.map((i) => i.funder).filter((f) => f && !INFRA_CLASSES.has(f.funderClass)).map((f) => f!.funder))].slice(0, MASS.originIntermediaryLimit);
    const ff = originAddress && MASS.originMaxHops >= 2 && funders.length ? await Promise.all(funders.map((f) => helius.getOriginalFunder(f))) : [];
    const fundersOfFunders = Object.fromEntries(funders.map((f, i) => [f, data(ff[i])?.funder ?? null]));

    const graph = buildWalletGraph({ mint: address, origin: originAddress, wallets: inputs, fundersOfFunders });
    const clusters = graph.sufficient ? clusterWallets(graph.nodes, graph.edges, originAddress) : [];
    mass = {
      heliusEnhanced: true,
      analyzedWallets: graph.nodes.length,
      nodes: graph.nodes,
      edges: graph.edges,
      clusters,
      relationshipSignal: graph.sufficient ? clusters.reduce((m, c) => Math.max(m, c.relationshipSignal ?? 0), 0) : null,
      graphState: !graph.sufficient ? "INSUFFICIENT_GRAPH_DATA" : clusters.length ? "ENHANCED" : "NO_RELATIONSHIPS",
    };
    if (graph.sufficient) {
      const shares = clusters.map((c) => c.combinedSupplyPercent);
      cells.clusterSharePercent = clusters.length && shares.every((s) => s !== null) ? (shares as number[]).reduce((a, b) => a + b, 0) : clusters.length ? null : 0;
    }
  }

  /* Step 7: transaction flow. Movements from the mint, the origin and the traced holders. */
  const flow: FlowContext = {
    mint: address,
    supply,
    pools: new Set([...(market?.pairs ?? []).map((p) => p.pairAddress), ...Object.keys(POOL_INFRASTRUCTURE), ...cells.holders.filter((h) => h.classification === "POOL").map((h) => h.address)]),
    origin: originAddress,
    majorHolders: new Set(candidates.map((c) => c.address)),
    clusterWallets: new Set(mass.clusters.flatMap((c) => c.wallets)),
  };
  const originTransfers = data(originHistoryRes);
  const originMoves = originAddress && originTransfers ? walletMovements(originAddress, originTransfers, flow) : null;
  const movements = majorMovements([
    ...mintMovements(data(mintTxsRes), flow),
    ...(originMoves ?? []),
    ...intel.flatMap((w) => walletMovements(w.wallet, data(w.transfers), flow)),
  ]);
  const traced = heliusOn && (mintTxsRes?.available === true || intel.some((w) => w.transfers.available));
  const bloodstream = buildBloodstream(market, movements, traced);

  /* Step 6: origin. */
  const brain = buildBrain({
    security,
    mint,
    origin: originInfo,
    supply,
    holderSetSharePercent: cells.originSharePercent,
    helius: heliusOn
      ? { balance: data(originBalanceRes), relatedTokens: data(relatedRes)?.filter((id) => id !== address) ?? null, movements: originMoves }
      : null,
  });
  if (cells.originSharePercent === null && brain.originSupplyPercent !== null) cells.originSharePercent = brain.originSupplyPercent;

  /* Sources + mode. Helius is a required provider: without it the scan is PARTIAL. */
  const sources: SourceResult[] = [marketRes.source, securityRes.source];
  if (heliusOn) {
    sources.push(
      heliusSource("token config", [mintRes]),
      heliusSource("holders", [largestRes, ownersRes]),
      heliusSource("origin", [originRes, originBalanceRes, relatedRes, originHistoryRes]),
      heliusSource("transactions", [mintTxsRes]),
      heliusSource("wallet graph", intel.flatMap((w) => [w.funder, w.identity, w.transfers])),
    );
  } else {
    const state = heliusState();
    sources.push({ provider: "helius", scope: "deep analysis", status: "not_configured", fetchedAt: null, cached: false, note: state === "disabled" ? "disabled" : "not configured" });
  }
  const mode = sources.some((s) => s.status === "error" || s.status === "not_configured") ? "partial" : "live";

  const firstSeen = [market?.firstPairAt, originInfo?.firstTimestamp].filter((v): v is number => typeof v === "number");
  const coverage: Coverage = {
    market: market !== null,
    security: security !== null,
    genome: genome.mintAuthorityActive !== null || genome.freezeAuthorityActive !== null,
    liquidity: heart.liquidityUsd !== null,
    holders: cells.holders.length > 0,
    origin: brain.originAddress !== null,
    transactions: bloodstream.buys24h !== null || traced,
    walletGraph: mass.graphState === "ENHANCED" || mass.graphState === "NO_RELATIONSHIPS",
    fundingAnalysis: intel.some((w) => w.funder.available),
    walletIdentity: intel.some((w) => w.identity.available),
  };

  /* Step 11: findings. Step 12: status + case file. */
  const findings = generateFindings({ mode, marketListed: marketFailed ? null : market !== null, heliusConfigured: heliusOn, genome, heart, brain, cells, bloodstream, mass, sources });
  const { statusCode, status, flags } = evaluateStatus(findings, mode);

  const result: ScanResult = {
    mode,
    chain: "solana",
    address,
    token: {
      name: market?.name ?? security?.name ?? null,
      symbol: market?.symbol ?? security?.symbol ?? null,
      image: market?.image ?? null,
      priceUsd: market?.priceUsd ?? null,
      marketCap: market?.marketCap ?? null,
      fdv: market?.fdv ?? null,
      ageSeconds: firstSeen.length ? Math.max(0, now - Math.min(...firstSeen)) : null,
      websites: market?.websites ?? [],
      socials: market?.socials ?? [],
    },
    genome,
    heart,
    brain,
    cells,
    bloodstream,
    mass,
    findings,
    caseFile: { id: caseId("solana", address), status, statusCode, flags, verdict: evaluateVerdict(findings, flags, mode), createdAt: new Date(now * 1000).toISOString() },
    coverage,
    sources,
  };
  return { ok: true, result };
}
