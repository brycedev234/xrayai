/**
 * Wallet relationship graph (MASS engine).
 *
 * Pure function over data already fetched by the Helius adapter, so it can be
 * tested with fixtures. Every edge carries the raw evidence it was built from
 * (signatures, timestamps, funder addresses). Edges describe observed
 * relationships only; none of them implies common ownership.
 *
 * Identity matters: a funder classified as an exchange, DEX, protocol,
 * bridge, treasury or other known service produces COMMON_WITHDRAWAL_SOURCE,
 * which is shown but never links wallets.
 *
 * Sufficiency: the graph is "insufficient" (signal = null) when fewer than 3
 * wallets could be analysed, or when funder AND transfer lookups both failed
 * for more than half of them.
 */

import type { FunderInfo, WalletIdentity, WalletTransfer } from "../providers/helius";
import type { IdentityClass, RelationshipType, WalletEdge, WalletNode } from "../types/scan";
import { MASS } from "@/config/thresholds";
import { BURN_ADDRESSES, POOL_INFRASTRUCTURE } from "./knownAddresses";
import { RELATIONSHIP_WEIGHTS, SYNC_WINDOW_SECONDS } from "./relationshipSignal";

export interface GraphWalletInput {
  wallet: string;
  balance: number | null;
  supplyPercent: number | null;
  identity: WalletIdentity | null;
  funder: FunderInfo | null;
  /** null when the history lookup failed (distinct from "no transfers"). */
  transfers: WalletTransfer[] | null;
}

export interface GraphInput {
  mint: string;
  origin: string | null;
  wallets: GraphWalletInput[];
  /** Funder of each (non-infrastructure) funder, for two-hop origin proximity. */
  fundersOfFunders?: Record<string, string | null>;
}

export interface WalletGraph {
  nodes: WalletNode[];
  edges: WalletEdge[];
  sufficient: boolean;
}

/** Every known entity class is infrastructure for funding purposes; only UNKNOWN wallets can be a private common funder. */
export const INFRA_CLASSES: ReadonlySet<IdentityClass> = new Set(["CENTRALIZED_EXCHANGE", "DEX", "PROTOCOL", "TREASURY", "BRIDGE", "KNOWN_SERVICE"]);
/** A counterparty seen by more than this many analysed wallets is treated as a service, not a link. */
const MAX_SHARED_COUNTERPARTY_FANOUT = 5;
const MIN_SHARED_SOL = 0.01;

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function edge(from: string, to: string, type: RelationshipType, timestamp: number | null, evidence: WalletEdge["evidence"]): WalletEdge {
  return { from, to, relationshipType: type, timestamp, evidence, strength: RELATIONSHIP_WEIGHTS[type] };
}

export function buildWalletGraph(input: GraphInput): WalletGraph {
  const { mint, origin } = input;
  const wallets = input.wallets.filter((w) => !BURN_ADDRESSES.has(w.wallet) && !POOL_INFRASTRUCTURE[w.wallet]);
  const set = new Set(wallets.map((w) => w.wallet));

  const nodes: WalletNode[] = wallets.map((w) => {
    const acquisitions = (w.transfers ?? []).filter((t) => t.asset === mint && t.to === w.wallet).map((t) => t.timestamp);
    return {
      wallet: w.wallet,
      balance: w.balance,
      supplyPercent: w.supplyPercent,
      classification: w.identity?.classification ?? "UNKNOWN",
      identity: w.identity?.name ?? null,
      firstTokenInteraction: acquisitions.length ? Math.min(...acquisitions) : null,
      funder: w.funder?.funder ?? null,
      funderName: w.funder?.funderName ?? null,
      funderClass: w.funder?.funderClass ?? null,
    };
  });

  const failed = wallets.filter((w) => w.funder === null && w.transfers === null).length;
  const sufficient = wallets.length >= MASS.minWallets && failed <= wallets.length / 2;
  const edges: WalletEdge[] = [];

  /* COMMON_FUNDER / COMMON_WITHDRAWAL_SOURCE / funder-based ORIGIN_PROXIMITY */
  const byFunder = new Map<string, GraphWalletInput[]>();
  for (const w of wallets) {
    if (!w.funder) continue;
    byFunder.set(w.funder.funder, [...(byFunder.get(w.funder.funder) ?? []), w]);
  }
  for (const [funder, group] of byFunder) {
    const info = group[0].funder!;
    const infra = INFRA_CLASSES.has(info.funderClass);
    if (group.length >= 2) {
      const [anchor, ...rest] = group;
      for (const w of rest) {
        edges.push(
          edge(anchor.wallet, w.wallet, infra ? "COMMON_WITHDRAWAL_SOURCE" : "COMMON_FUNDER", w.funder!.timestamp, {
            funder,
            funderName: info.funderName,
            funderClass: info.funderClass,
            fundingSignatureA: anchor.funder!.signature,
            fundingSignatureB: w.funder!.signature,
          }),
        );
      }
    }
    if (!infra && origin) {
      for (const w of group) {
        if (funder === origin) {
          edges.push(edge(origin, w.wallet, "ORIGIN_PROXIMITY", w.funder!.timestamp, { hops: 1, via: "first SOL funding", signature: w.funder!.signature }));
        } else if (input.fundersOfFunders?.[funder] === origin) {
          edges.push(edge(origin, w.wallet, "ORIGIN_PROXIMITY", w.funder!.timestamp, { hops: 2, via: funder, signature: w.funder!.signature }));
        }
      }
    }
  }

  /* DIRECT_TRANSFER / REPEATED_INTERACTION / transfer-based ORIGIN_PROXIMITY */
  const seen = new Set<string>();
  const pairSignatures = new Map<string, Set<string>>();
  for (const w of wallets) {
    for (const t of w.transfers ?? []) {
      const counterparty = t.from === w.wallet ? t.to : t.from;
      const key = `${t.signature}:${t.asset}:${t.from}:${t.to}`;
      if (seen.has(key)) continue;
      if (set.has(counterparty) && counterparty !== w.wallet) {
        seen.add(key);
        edges.push(edge(t.from, t.to, "DIRECT_TRANSFER", t.timestamp, { signature: t.signature, asset: t.asset === "SOL" ? "SOL" : t.asset, amount: t.amount, source: t.from, destination: t.to }));
        const pk = pairKey(t.from, t.to);
        pairSignatures.set(pk, (pairSignatures.get(pk) ?? new Set()).add(t.signature));
      } else if (origin && counterparty === origin) {
        seen.add(key);
        edges.push(edge(origin, w.wallet, "ORIGIN_PROXIMITY", t.timestamp, { hops: 1, via: "direct transfer", signature: t.signature, asset: t.asset, amount: t.amount }));
      }
    }
  }
  for (const [pk, sigs] of pairSignatures) {
    if (sigs.size < 2) continue;
    const [a, b] = pk.split("|");
    edges.push(edge(a, b, "REPEATED_INTERACTION", null, { transfers: sigs.size }));
  }

  /* SHARED_COUNTERPARTY (supporting evidence only) */
  const counterparties = new Map<string, Set<string>>();
  for (const w of wallets) {
    for (const t of w.transfers ?? []) {
      if (t.asset !== "SOL" || (t.amount ?? 0) < MIN_SHARED_SOL) continue;
      const cp = t.from === w.wallet ? t.to : t.from;
      if (set.has(cp) || cp === origin || cp === w.funder?.funder || BURN_ADDRESSES.has(cp) || POOL_INFRASTRUCTURE[cp]) continue;
      counterparties.set(cp, (counterparties.get(cp) ?? new Set()).add(w.wallet));
    }
  }
  for (const [cp, ws] of counterparties) {
    if (ws.size < 2 || ws.size > MAX_SHARED_COUNTERPARTY_FANOUT) continue;
    const [anchor, ...rest] = [...ws];
    for (const w of rest) edges.push(edge(anchor, w, "SHARED_COUNTERPARTY", null, { counterparty: cp, wallets: ws.size }));
  }

  /* SYNCHRONIZED_ENTRY (supporting evidence only) */
  const entries = nodes.filter((n) => n.firstTokenInteraction !== null).sort((a, b) => a.firstTokenInteraction! - b.firstTokenInteraction!);
  for (let i = 1; i < entries.length; i++) {
    const delta = entries[i].firstTokenInteraction! - entries[i - 1].firstTokenInteraction!;
    if (delta <= SYNC_WINDOW_SECONDS) {
      edges.push(
        edge(entries[i - 1].wallet, entries[i].wallet, "SYNCHRONIZED_ENTRY", entries[i].firstTokenInteraction, {
          firstEntryA: entries[i - 1].firstTokenInteraction,
          firstEntryB: entries[i].firstTokenInteraction,
          deltaSeconds: delta,
          windowSeconds: SYNC_WINDOW_SECONDS,
        }),
      );
    }
  }

  return { nodes, edges, sufficient };
}
