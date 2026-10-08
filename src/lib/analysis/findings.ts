/**
 * FINDINGS: scan evidence turned into short factual statements.
 *
 *   MINT AUTHORITY ACTIVE · TOP 10 HOLDERS CONTROL 42.1% ·
 *   LIQUIDITY REPRESENTS 2.8% OF MARKET CAP · 2 CONNECTED HOLDER CLUSTERS DETECTED
 *
 * Every finding states something the data shows and carries the evidence it
 * came from. None says SAFE, SCAM, RUG or predicts anything. `status` links a
 * finding to the case-file status it supports (see statusEngine.ts).
 * Thresholds live in config/thresholds.ts.
 */

import { FLOW, HOLDERS, MASS } from "@/config/thresholds";
import type { Bloodstream, Brain, Cells, Finding, Genome, Heart, Mass, ScanMode, SourceResult } from "../types/scan";
import { liquidityFindings } from "./liquidityAnalysis";
import { INFRA_CLASSES } from "./walletGraph";

export interface FindingInputs {
  mode: ScanMode;
  /** false = DexScreener answered with no pair; null = DexScreener failed. */
  marketListed: boolean | null;
  /** Helius key present (false = not configured / disabled). Defaults to whether the graph ran. */
  heliusConfigured?: boolean;
  genome: Genome;
  heart: Heart;
  brain: Brain;
  cells: Cells;
  bloodstream: Bloodstream;
  mass: Mass;
  sources: SourceResult[];
}

const pct = (n: number) => `${n.toFixed(1)}%`;

export function generateFindings(i: FindingInputs): Finding[] {
  const out: Finding[] = [];
  const add = (organ: Finding["organ"], code: string, label: string, tone: Finding["tone"], status: Finding["status"] = null, evidence: Finding["evidence"] = {}) =>
    out.push({ code, organ, label, tone, status, evidence });

  /* GENOME */
  const g = i.genome;
  if (g.mintAuthorityActive === true) add("GENOME", "MINT_AUTHORITY_ACTIVE", "MINT AUTHORITY ACTIVE", "anomaly", "PRIVILEGED_AUTHORITY_ACTIVE", { authority: g.mintAuthority });
  if (g.mintAuthorityActive === false) add("GENOME", "MINT_AUTHORITY_REVOKED", "MINT AUTHORITY REVOKED", "neutral");
  if (g.freezeAuthorityActive === true) add("GENOME", "FREEZE_AUTHORITY_ACTIVE", "FREEZE AUTHORITY ACTIVE", "anomaly", "PRIVILEGED_AUTHORITY_ACTIVE", { authority: g.freezeAuthority });
  if (g.freezeAuthorityActive === false) add("GENOME", "FREEZE_AUTHORITY_REVOKED", "FREEZE AUTHORITY REVOKED", "neutral");
  if (g.transferHook) add("GENOME", "TRANSFER_HOOK_PRESENT", "TRANSFER HOOK PRESENT", "anomaly", "PRIVILEGED_AUTHORITY_ACTIVE");
  if (g.defaultAccountState === "FROZEN") add("GENOME", "DEFAULT_ACCOUNT_STATE_FROZEN", "NEW TOKEN ACCOUNTS START FROZEN", "anomaly", "PRIVILEGED_AUTHORITY_ACTIVE");
  if (g.transferFee) add("GENOME", "TRANSFER_FEE_PRESENT", "TRANSFER FEE PRESENT", "watch");
  if (g.metadataMutable === true) add("GENOME", "MUTABLE_METADATA", "MUTABLE METADATA", "watch", null, { updateAuthority: g.updateAuthority });
  if (g.metadataMutable === false) add("GENOME", "METADATA_IMMUTABLE", "METADATA IMMUTABLE", "neutral");
  if (g.token2022) add("GENOME", "TOKEN_2022", `TOKEN-2022 PROGRAM${g.extensions?.length ? ` · ${g.extensions.length} EXTENSION${g.extensions.length > 1 ? "S" : ""}` : ""}`, "neutral", null, { extensions: g.extensions?.join(",") ?? null });

  /* HEART */
  out.push(...liquidityFindings(i.heart, i.marketListed));

  /* BRAIN */
  const b = i.brain;
  if (b.originAddress && b.originSupplyPercent !== null) {
    if (b.originSupplyPercent >= HOLDERS.originHoldingPercent) {
      add("BRAIN", "ORIGIN_HOLDING", `ORIGIN WALLET HOLDS ${pct(b.originSupplyPercent)}`, b.originSupplyPercent >= HOLDERS.originHoldingWatchPercent ? "watch" : "neutral", null, { origin: b.originAddress, percent: b.originSupplyPercent });
    } else if (b.originTokenBalance === 0) {
      add("BRAIN", "ORIGIN_HOLDS_NONE", "ORIGIN WALLET HOLDS NO TOKENS", "neutral", null, { origin: b.originAddress });
    }
  }
  const originSells = b.recentTokenMovements.filter((m) => m.from === b.originAddress && m.kind === "SELL").length;
  const originOut = b.recentTokenMovements.filter((m) => m.from === b.originAddress && m.kind !== "SELL").length;
  if (originSells) add("BRAIN", "ORIGIN_SELLS", `ORIGIN SOLD IN ${originSells} OBSERVED TRANSACTION${originSells > 1 ? "S" : ""}`, "watch", null, { sells: originSells });
  if (originOut) add("BRAIN", "ORIGIN_OUTBOUND", `ORIGIN MOVED TOKENS IN ${originOut} OBSERVED TRANSACTION${originOut > 1 ? "S" : ""}`, "neutral", null, { movements: originOut });
  for (const link of b.authorityLinks) add("BRAIN", "AUTHORITY_LINK", link, "neutral");
  if (b.priorDeployments) add("BRAIN", "RELATED_TOKENS", `ORIGIN IS AUTHORITY OF ${b.priorDeployments} OTHER TOKEN${b.priorDeployments > 1 ? "S" : ""}`, "neutral", null, { count: b.priorDeployments });

  /* CELLS */
  const c = i.cells;
  const lb = (k: (typeof c.lowerBounds)[number]) => (c.lowerBounds.includes(k) ? "≥" : "");
  const high = (c.top10Percent ?? 0) > HOLDERS.highTop10Percent || (c.top1Percent ?? 0) > HOLDERS.highTop1Percent;
  if (c.top10Percent !== null) {
    add("CELLS", "TOP10_CONCENTRATION", `TOP 10 HOLDERS CONTROL ${lb("top10")}${pct(c.top10Percent)}`, (c.top10Percent > HOLDERS.highTop10Percent) ? "watch" : "neutral", high ? "HIGH_HOLDER_CONCENTRATION" : null, { percent: c.top10Percent, threshold: HOLDERS.highTop10Percent });
  }
  if (c.top1Percent !== null) {
    add("CELLS", "LARGEST_HOLDER", `LARGEST HOLDER CONTROLS ${lb("top1")}${pct(c.top1Percent)}`, (c.top1Percent > HOLDERS.highTop1Percent) ? "watch" : "neutral", c.top1Percent > HOLDERS.highTop1Percent ? "HIGH_HOLDER_CONCENTRATION" : null, { percent: c.top1Percent, holder: c.largestNonPoolHolder?.address ?? null, threshold: HOLDERS.highTop1Percent });
  }
  const excluded = c.holders.filter((h) => h.classification === "POOL" || h.classification === "BURN" || h.classification === "PROGRAM" || h.classification === "EXCHANGE").length;
  if (excluded) add("CELLS", "EXCLUDED_ACCOUNTS", `${excluded} POOL / BURN / EXCHANGE ACCOUNT${excluded > 1 ? "S" : ""} EXCLUDED FROM CONCENTRATION`, "neutral", null, { excluded });

  /* BLOODSTREAM */
  const f = i.bloodstream;
  if (f.buys24h !== null && f.sells24h !== null && f.buys24h > 0 && f.sells24h / f.buys24h > FLOW.sellPressureRatio) {
    add("BLOODSTREAM", "SELLS_EXCEED_BUYS", `SELLS EXCEED BUYS ${(f.sells24h / f.buys24h).toFixed(1)}:1 OVER 24H`, "watch", null, { buys: f.buys24h, sells: f.sells24h });
  }
  if (f.movementsTraced && f.majorMovements.length) {
    add("BLOODSTREAM", "MAJOR_MOVEMENTS", `${f.majorMovements.length} MAJOR TOKEN MOVEMENT${f.majorMovements.length > 1 ? "S" : ""} (≥${FLOW.majorMovementPercent}% OF SUPPLY)`, "neutral", null, { count: f.majorMovements.length });
    for (const actor of ["ORIGIN", "CLUSTER"] as const) {
      const moves = f.majorMovements.filter((m) => m.actor === actor);
      if (!moves.length) continue;
      const share = moves.reduce((s, m) => s + (m.supplyPercent ?? 0), 0);
      add("BLOODSTREAM", `${actor}_MAJOR_MOVEMENTS`, `${actor === "ORIGIN" ? "ORIGIN WALLET" : "CLUSTER WALLETS"} MOVED ${pct(share)} OF SUPPLY IN ${moves.length} TRANSACTION${moves.length > 1 ? "S" : ""}`, "watch", null, { movements: moves.length, percent: share });
    }
  }

  /* MASS */
  const m = i.mass;
  if (!m.heliusEnhanced) {
    const configured = i.heliusConfigured ?? false;
    add("MASS", "DEEP_WALLET_ANALYSIS_NOT_AVAILABLE", `DEEP WALLET ANALYSIS NOT AVAILABLE · ${configured ? "HELIUS DID NOT RESPOND" : "HELIUS NOT CONFIGURED"}`, configured ? "watch" : "neutral");
  } else if (m.graphState === "INSUFFICIENT_GRAPH_DATA") {
    add("MASS", "INSUFFICIENT_GRAPH_DATA", "INSUFFICIENT GRAPH DATA", "watch", null, { wallets: m.analyzedWallets });
  } else {
    if (!m.clusters.length) add("MASS", "NO_CLUSTERS", `NO CONNECTED HOLDER CLUSTERS DETECTED · ${m.analyzedWallets} WALLETS TRACED`, "neutral", null, { wallets: m.analyzedWallets });
    else {
      add("MASS", "CLUSTERS_DETECTED", `${m.clusters.length} CONNECTED HOLDER CLUSTER${m.clusters.length > 1 ? "S" : ""} DETECTED`, "anomaly", "RELATIONSHIP_SIGNALS_DETECTED", { clusters: m.clusters.length });
      for (const cl of m.clusters) {
        const anomalous = (cl.relationshipSignal ?? 0) >= MASS.anomalousSignal && (cl.combinedSupplyPercent ?? 0) >= MASS.anomalousSupplyPercent;
        add("MASS", "CLUSTER", `${cl.id}: ${cl.wallets.length} CONNECTED WALLETS HOLD ${cl.combinedSupplyPercent === null ? "—" : pct(cl.combinedSupplyPercent)} · SIGNAL ${cl.relationshipSignal ?? "—"}`, "anomaly", anomalous ? "ANOMALOUS_STRUCTURE_DETECTED" : "RELATIONSHIP_SIGNALS_DETECTED", {
          cluster: cl.id,
          wallets: cl.wallets.length,
          percent: cl.combinedSupplyPercent,
          signal: cl.relationshipSignal,
        });
      }
    }

    /* Funding: private common funders vs known exchange / infrastructure sources. */
    const byFunder = new Map<string, { wallets: number; cls: string | null; name: string | null }>();
    for (const n of m.nodes) {
      if (!n.funder) continue;
      const e = byFunder.get(n.funder) ?? { wallets: 0, cls: n.funderClass, name: n.funderName };
      e.wallets++;
      byFunder.set(n.funder, e);
    }
    for (const [funder, e] of byFunder) {
      if (e.wallets < 2) continue;
      if (e.cls && INFRA_CLASSES.has(e.cls as never)) {
        const what = e.cls === "CENTRALIZED_EXCHANGE" ? "A KNOWN EXCHANGE" : e.name && /HIGH-ACTIVITY/.test(e.name) ? "A HIGH-ACTIVITY SERVICE ADDRESS" : "KNOWN INFRASTRUCTURE";
        add("MASS", "COMMON_WITHDRAWAL_SOURCE", `COMMON FUNDER IS ${what} · ${e.wallets} HOLDERS · COMMON WITHDRAWAL SOURCE`, "neutral", null, { funder, name: e.name, classification: e.cls, wallets: e.wallets });
      } else {
        add("MASS", "COMMON_FUNDER", `${e.wallets} IMPORTANT HOLDERS SHARE A MEANINGFUL FUNDING SOURCE`, "anomaly", null, { funder, wallets: e.wallets });
      }
    }
    const direct = m.edges.filter((e) => e.relationshipType === "DIRECT_TRANSFER").length;
    if (direct) add("MASS", "DIRECT_TRANSFERS", `${direct} DIRECT TRANSFER${direct > 1 ? "S" : ""} BETWEEN IMPORTANT HOLDERS`, "watch", null, { transfers: direct });
    const near = new Set(m.edges.filter((e) => e.relationshipType === "ORIGIN_PROXIMITY").map((e) => e.to)).size;
    if (near) add("MASS", "ORIGIN_PROXIMITY", `${near} IMPORTANT HOLDER${near > 1 ? "S ARE" : " IS"} WITHIN ${MASS.originMaxHops} HOPS OF THE ORIGIN`, "watch", null, { wallets: near });
    if (c.clusterSharePercent) add("MASS", "CLUSTER_SHARE", `CONNECTED CLUSTERS HOLD ${pct(c.clusterSharePercent)} OF SUPPLY`, "anomaly", null, { percent: c.clusterSharePercent });
  }

  /* SCAN */
  const failed = [...new Set(i.sources.filter((s) => s.status === "error" || s.status === "not_configured").map((s) => s.provider.toUpperCase()))];
  if (i.mode === "partial") add("SCAN", "PARTIAL_SCAN", `PARTIAL SCAN · ${failed.join(" + ") || "PROVIDER"} UNAVAILABLE`, "watch", "PARTIAL_SCAN", { providers: failed.join(",") });

  const nothing = c.holders.length === 0 && i.heart.liquidityUsd === null && g.mintAuthorityActive === null && g.freezeAuthorityActive === null;
  if (nothing) add("SCAN", "INSUFFICIENT_DATA", "INSUFFICIENT DATA TO DESCRIBE THIS TOKEN", "watch", "INSUFFICIENT_DATA");

  return out;
}
