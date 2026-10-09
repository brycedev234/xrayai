/**
 * Plain-English layer over a scan result.
 *
 * Every technical readout keeps its exact value; this module only adds a
 * short sentence saying what it means for someone holding or buying the
 * token. It reads the result and never adds data: an unknown stays unknown.
 * Wording follows the house rules: linked / connected, never accusations,
 * and never "safe".
 */

import { HOLDERS } from "@/config/thresholds";
import * as d from "@/lib/display";
import type { Finding, ScanResult } from "@/lib/types/scan";

export type VitalTone = "good" | "watch" | "bad" | "unknown";

export interface Vital {
  key: string;
  question: string;
  answer: string;
  detail: string;
  tone: VitalTone;
}

const flagged = (r: ScanResult, code: string) => r.caseFile.flags.some((f) => f.code === code) || r.findings.some((f) => f.code === code);

/** The handful of questions a buyer actually asks, answered from the scan. */
export function vitals(r: ScanResult): Vital[] {
  const { genome: g, heart: h, cells: c, mass: m, brain: b, bloodstream: f } = r;
  const out: Vital[] = [];

  out.push(
    g.mintAuthorityActive === true
      ? { key: "mint", question: "Can more tokens be printed?", answer: "YES", tone: "bad", detail: "A wallet still holds the mint key and can create new tokens, which dilutes every holder." }
      : g.mintAuthorityActive === false
        ? { key: "mint", question: "Can more tokens be printed?", answer: "NO", tone: "good", detail: "The mint key is revoked. The supply is fixed." }
        : { key: "mint", question: "Can more tokens be printed?", answer: "UNKNOWN", tone: "unknown", detail: "The mint setting could not be read." },
  );

  const trap = g.transferHook === true || g.defaultAccountState === "FROZEN";
  out.push(
    g.freezeAuthorityActive === true || trap
      ? {
          key: "freeze",
          question: "Can your tokens be frozen or blocked?",
          answer: "YES",
          tone: "bad",
          detail: g.freezeAuthorityActive === true ? "A wallet can freeze holders so they cannot sell." : "Custom transfer rules can stop or gate transfers.",
        }
      : g.freezeAuthorityActive === false
        ? { key: "freeze", question: "Can your tokens be frozen or blocked?", answer: "NO", tone: "good", detail: "No freeze key and no custom transfer rules." }
        : { key: "freeze", question: "Can your tokens be frozen or blocked?", answer: "UNKNOWN", tone: "unknown", detail: "The freeze setting could not be read." },
  );

  const lp = h.lpStatus?.label === "LP BURNED" ? " The pool tokens are burned, so it can't be pulled." : h.lpStatus?.label === "LP LOCKED" ? " The pool tokens are locked." : "";
  out.push(
    h.liquidityUsd === null
      ? { key: "liquidity", question: "Is there money to sell into?", answer: "NO POOL", tone: "unknown", detail: "No trading pool was found, so there is no price to sell at." }
      : flagged(r, "LOW_LIQUIDITY")
        ? { key: "liquidity", question: "Is there money to sell into?", answer: "THIN", tone: "watch", detail: `${d.usd(h.liquidityUsd)} in the pool. A large sell will move the price hard.${lp}` }
        : { key: "liquidity", question: "Is there money to sell into?", answer: d.usd(h.liquidityUsd, true), tone: "good", detail: `${d.usd(h.liquidityUsd)} in the pool.${lp}` },
  );

  const top10 = d.pct(c.top10Percent, 1, { lowerBound: c.lowerBounds.includes("top10") });
  out.push(
    c.top10Percent === null
      ? { key: "whales", question: "Do a few wallets own most of it?", answer: "UNKNOWN", tone: "unknown", detail: "Holder balances could not be read." }
      : flagged(r, "HIGH_HOLDER_CONCENTRATION")
        ? { key: "whales", question: "Do a few wallets own most of it?", answer: "YES", tone: "watch", detail: `The top 10 wallets hold ${top10}. A few sellers can sink the price.` }
        : { key: "whales", question: "Do a few wallets own most of it?", answer: "NO", tone: "good", detail: `The top 10 wallets hold ${top10}; the largest holds ${d.pct(c.top1Percent)}. Pools, burns and exchanges are not counted.` },
  );

  const linked = m.clusters.reduce((n, cl) => n + cl.wallets.length, 0);
  out.push(
    m.graphState === "ENHANCED"
      ? {
          key: "linked",
          question: "Are the big holders linked?",
          answer: `${m.clusters.length} GROUP${m.clusters.length > 1 ? "S" : ""}`,
          tone: "bad",
          detail: `${linked} wallets holding ${d.pct(c.clusterSharePercent)} look connected: a shared funder, transfers between them or buys seconds apart. That is what a bundled launch can look like.`,
        }
      : m.graphState === "NO_RELATIONSHIPS"
        ? { key: "linked", question: "Are the big holders linked?", answer: "NO LINKS", tone: "good", detail: `${m.analyzedWallets} top holders traced. None share a funder or trade with each other.` }
        : m.graphState === "INSUFFICIENT_GRAPH_DATA"
          ? { key: "linked", question: "Are the big holders linked?", answer: "NOT CHECKED", tone: "unknown", detail: "Too few wallets could be traced to check." }
          : { key: "linked", question: "Are the big holders linked?", answer: "NOT CHECKED", tone: "unknown", detail: "Deep wallet tracing is not running on this server." },
  );

  const sold = r.findings.find((x) => x.code === "ORIGIN_SELLS");
  out.push(
    !b.originAddress
      ? { key: "creator", question: "Is the creator still holding?", answer: "UNKNOWN", tone: "unknown", detail: "The launch wallet could not be identified." }
      : sold
        ? { key: "creator", question: "Is the creator still holding?", answer: "SELLING", tone: "watch", detail: `The launch wallet has sold in recent transactions${b.originSupplyPercent !== null ? ` and holds ${d.pct(b.originSupplyPercent)}` : ""}.` }
        : b.originSupplyPercent === null
          ? { key: "creator", question: "Is the creator still holding?", answer: "UNKNOWN", tone: "unknown", detail: "The launch wallet's balance could not be read." }
          : b.originSupplyPercent === 0
            ? { key: "creator", question: "Is the creator still holding?", answer: "NO", tone: "good", detail: "The launch wallet holds none of the token." }
            : {
                key: "creator",
                question: "Is the creator still holding?",
                answer: d.pct(b.originSupplyPercent),
                tone: b.originSupplyPercent >= HOLDERS.originHoldingWatchPercent ? "watch" : "good",
                detail: b.originSupplyPercent >= HOLDERS.originHoldingWatchPercent ? "The launch wallet still holds a large bag it could sell." : "The launch wallet holds a small share.",
              },
  );

  out.push(
    f.buys24h === null || f.sells24h === null
      ? { key: "flow", question: "Are people buying or selling?", answer: "UNKNOWN", tone: "unknown", detail: "No trade counts for the last 24 hours." }
      : f.sells24h > f.buys24h
        ? { key: "flow", question: "Are people buying or selling?", answer: "SELLING", tone: "watch", detail: `${d.int(f.sells24h)} sells against ${d.int(f.buys24h)} buys in 24 hours.` }
        : { key: "flow", question: "Are people buying or selling?", answer: "BUYING", tone: "good", detail: `${d.int(f.buys24h)} buys against ${d.int(f.sells24h)} sells in 24 hours.` },
  );

  return out;
}

const FINDING: Record<string, string> = {
  MINT_AUTHORITY_ACTIVE: "Someone can still print new tokens at any time, diluting every holder.",
  MINT_AUTHORITY_REVOKED: "Nobody can print new tokens. The supply is fixed.",
  FREEZE_AUTHORITY_ACTIVE: "Someone can freeze wallets so their tokens can't be sold.",
  FREEZE_AUTHORITY_REVOKED: "Nobody can freeze your tokens.",
  TRANSFER_HOOK_PRESENT: "Every transfer runs custom code the creator controls. It can block or tax sells.",
  DEFAULT_ACCOUNT_STATE_FROZEN: "New holders start frozen and need permission before they can move tokens.",
  TRANSFER_FEE_PRESENT: "A fee is taken on every transfer, buys and sells included.",
  MUTABLE_METADATA: "The name, symbol and image can still be changed.",
  METADATA_IMMUTABLE: "The name, symbol and image are locked for good.",
  TOKEN_2022: "Built on Solana's newer token program, which allows extra built-in rules.",
  ORIGIN_HOLDING: "The wallet that launched the token still holds this share.",
  ORIGIN_HOLDS_NONE: "The launch wallet no longer holds any of the token.",
  ORIGIN_SELLS: "The launch wallet has been selling.",
  ORIGIN_OUTBOUND: "The launch wallet has sent tokens out to other wallets.",
  RELATED_TOKENS: "The launch wallet controls other tokens too. Their history is worth a look.",
  TOP10_CONCENTRATION: "How much the 10 biggest wallets own, not counting pools, burns and exchanges.",
  LARGEST_HOLDER: "The single biggest wallet. One big seller can crash the price.",
  EXCLUDED_ACCOUNTS: "Pools, burned tokens and exchange wallets aren't real holders, so they're left out.",
  LOW_LIQUIDITY: "Little money in the pool. Selling even a modest bag moves the price a lot.",
  LOW_LIQUIDITY_RELATIVE_TO_MARKET_CAP: "The pool is small next to the market cap, so the price is easy to push around.",
  LIQUIDITY_MARKET_CAP_RATIO: "Pool size compared with market cap. Higher is sturdier.",
  STRONG_MARKET_DEPTH: "A deep pool. Normal-size trades barely move the price.",
  LP_BURNED: "The pool's ownership tokens are burned, so the liquidity can't be pulled.",
  LP_LOCKED: "The pool's ownership tokens are locked for now.",
  NEW_LIQUIDITY_POOL: "The trading pool is brand new.",
  NO_LIQUIDITY_PAIR_FOUND: "No trading pool was found.",
  SELLS_EXCEED_BUYS: "More people are selling than buying today.",
  MAJOR_MOVEMENTS: "Large chunks of supply changed hands recently.",
  ORIGIN_MAJOR_MOVEMENTS: "The launch wallet moved a large chunk of supply.",
  CLUSTER_MAJOR_MOVEMENTS: "Connected wallets moved a large chunk of supply.",
  DEEP_WALLET_ANALYSIS_NOT_AVAILABLE: "Wallet tracing didn't run, so links between holders weren't checked.",
  INSUFFICIENT_GRAPH_DATA: "Too few wallets could be traced to check for links.",
  NO_CLUSTERS: "The biggest holders don't share funders or trade with each other.",
  CLUSTERS_DETECTED: "Some big holders look connected: same funding source, transfers between them or buys at the same moment.",
  CLUSTER: "These wallets appear connected. Together they hold this share.",
  COMMON_WITHDRAWAL_SOURCE: "Several holders got their first SOL from the same exchange. That's normal and doesn't link them.",
  COMMON_FUNDER: "Several big holders got their first SOL from the same private wallet.",
  DIRECT_TRANSFERS: "Big holders sent tokens or SOL straight to each other.",
  ORIGIN_PROXIMITY: "Some big holders were funded by, or sit close to, the launch wallet.",
  CLUSTER_SHARE: "Total supply held by all connected groups.",
  PARTIAL_SCAN: "Some data sources didn't answer, so this scan is incomplete.",
  INSUFFICIENT_DATA: "Not enough data yet to say anything useful about this token.",
};

/** One plain sentence for a finding, or null when the label already says it. */
export function explainFinding(f: Finding): string | null {
  return FINDING[f.code] ?? null;
}

/** Rhythm of the verdict trace: calm when little is flagged, irregular when a lot is. */
export function verdictRhythm(level: ScanResult["caseFile"]["verdict"]["level"]): { word: string; tone: VitalTone } {
  return level === "SERIOUS_RED_FLAGS"
    ? { word: "IRREGULAR", tone: "bad" }
    : level === "SOME_RED_FLAGS"
      ? { word: "ELEVATED", tone: "watch" }
      : level === "FEW_RED_FLAGS"
        ? { word: "STEADY", tone: "good" }
        : { word: "FAINT", tone: "unknown" };
}
