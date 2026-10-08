/**
 * CELLS: holder structure.
 *
 * Holder sets are the largest accounts a provider returns (GoPlus top
 * holders, or Helius getTokenLargestAccounts with owners resolved). They are
 * never the full holder list:
 * - token accounts are aggregated by owner, but one person can still control
 *   several owners;
 * - pool, burn and program-owned accounts, and owners Helius identifies as
 *   exchanges or infrastructure, are excluded from concentration;
 * - a top-N figure computed from fewer than N eligible holders in a truncated
 *   set is flagged as a lower bound.
 * The total holder count is only ever the provider-reported figure.
 */

import type { MarketData } from "../providers/dexscreener";
import type { SecurityData } from "../providers/goplus";
import type { AccountOwner, LargestAccount, WalletIdentity } from "../providers/helius";
import { SYSTEM_PROGRAM } from "../providers/helius";
import type { Cells, Holder, HolderClass } from "../types/scan";
import { BURN_ADDRESSES, isPoolTag, POOL_INFRASTRUCTURE } from "./knownAddresses";

const EXCLUDED: ReadonlySet<HolderClass> = new Set(["POOL", "BURN", "PROGRAM", "EXCHANGE"]);

export interface HolderInputs {
  security: SecurityData | null;
  market: MarketData | null;
  helius: { largest: LargestAccount[]; owners: AccountOwner[]; supply: number } | null;
  origin: string | null;
  /** Helius identities of holder owners, once known. */
  identities?: Map<string, WalletIdentity>;
}

function classify(owner: string | null, tag: string | null, locked: boolean | null, pairs: Set<string>, origin: string | null, ownerProgram?: string | null): HolderClass {
  if (owner && BURN_ADDRESSES.has(owner)) return "BURN";
  if (owner && (pairs.has(owner) || POOL_INFRASTRUCTURE[owner])) return "POOL";
  if (isPoolTag(tag)) return "POOL";
  if (ownerProgram && POOL_INFRASTRUCTURE[ownerProgram]) return "POOL";
  if (ownerProgram && ownerProgram !== SYSTEM_PROGRAM) return "PROGRAM";
  if (owner && origin && owner === origin) return "ORIGIN";
  if (locked) return "LOCKED";
  return "WALLET";
}

/** Aggregates rows by owner (or token account when the owner is unknown) and sorts by share. */
function aggregate(rows: Holder[]): Holder[] {
  const map = new Map<string, Holder>();
  for (const r of rows) {
    const prev = map.get(r.address);
    if (!prev) {
      map.set(r.address, { ...r });
      continue;
    }
    prev.amount = prev.amount !== null && r.amount !== null ? prev.amount + r.amount : null;
    prev.percent = prev.percent !== null && r.percent !== null ? prev.percent + r.percent : null;
    prev.tokenAccount = null;
  }
  return [...map.values()].sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1));
}

/** Re-labels holders that Helius identified as exchanges or infrastructure. */
function applyIdentity(h: Holder, id: WalletIdentity | undefined): Holder {
  if (!id || id.classification === "UNKNOWN") return h;
  const classification: HolderClass =
    h.classification !== "WALLET" && h.classification !== "LOCKED"
      ? h.classification
      : id.classification === "CENTRALIZED_EXCHANGE"
        ? "EXCHANGE"
        : id.classification === "DEX"
          ? "POOL"
          : id.classification === "PROTOCOL" || id.classification === "BRIDGE"
            ? "PROGRAM"
            : h.classification;
  return { ...h, classification, identity: id.name ?? id.classification.replace(/_/g, " ") };
}

export function buildCells({ security, market, helius, origin, identities }: HolderInputs): Cells {
  const pairs = new Set((market?.pairs ?? []).map((p) => p.pairAddress));
  let rows: Holder[] = [];
  let totalSupply: number | null = security?.totalSupply ?? null;

  if (helius && helius.largest.length) {
    totalSupply = helius.supply;
    const ownerOf = new Map(helius.owners.map((o) => [o.tokenAccount, o]));
    rows = helius.largest.map((a) => {
      const o = ownerOf.get(a.tokenAccount);
      const owner = o?.owner ?? null;
      return {
        address: owner ?? a.tokenAccount,
        tokenAccount: a.tokenAccount,
        amount: a.amount,
        percent: helius.supply > 0 ? (a.amount / helius.supply) * 100 : null,
        classification: classify(owner, null, null, pairs, origin, o?.ownerProgram ?? null),
        tag: owner ? (POOL_INFRASTRUCTURE[owner] ?? null) : null,
        identity: null,
      };
    });
  } else if (security?.holders.length) {
    rows = security.holders.map((h) => ({
      address: h.owner ?? h.tokenAccount ?? "unknown",
      tokenAccount: h.tokenAccount,
      amount: h.amount,
      percent: h.percent,
      classification: classify(h.owner, h.tag, h.locked, pairs, origin),
      tag: h.tag ?? (h.owner ? (POOL_INFRASTRUCTURE[h.owner] ?? null) : null),
      identity: null,
    }));
  }

  const holders = aggregate(rows).map((h) => applyIdentity(h, identities?.get(h.address)));
  const holderCount = security?.holderCount ?? null;
  const complete = holderCount !== null && holders.length >= holderCount;
  const eligible = holders.filter((h) => !EXCLUDED.has(h.classification) && h.percent !== null);
  const lowerBounds: Cells["lowerBounds"] = [];
  const top = (n: number, key: Cells["lowerBounds"][number]) => {
    if (!eligible.length) return null;
    if (eligible.length < n && !complete) lowerBounds.push(key);
    return eligible.slice(0, n).reduce((s, h) => s + (h.percent as number), 0);
  };

  const originRow = origin ? holders.find((h) => h.address === origin) : undefined;

  return {
    holderCount,
    holderCountSource: holderCount !== null ? "goplus" : null,
    totalSupply,
    top1Percent: top(1, "top1"),
    top5Percent: top(5, "top5"),
    top10Percent: top(10, "top10"),
    top20Percent: top(20, "top20"),
    lowerBounds,
    largestNonPoolHolder: eligible[0] ?? null,
    originSharePercent: originRow?.percent ?? null,
    clusterSharePercent: null,
    freshWalletSharePercent: null,
    holderSetSize: holders.length,
    holders: holders.slice(0, 40),
  };
}
