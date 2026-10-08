/**
 * RELATIONSHIP SIGNAL
 *
 * A deterministic 0-100 summary of how many observable relationship
 * indicators connect the wallets in a cluster. It is NOT a probability that
 * the wallets share an owner, and NOT a scam / rug likelihood.
 *
 * Formula, per cluster of n wallets:
 *
 *   coverage_k = (wallets touched by at least one edge of type k) / n
 *   signal     = 100 * (1 - Π_k (1 - w_k * coverage_k))
 *
 * Each indicator type can only add to the signal, a type that covers every
 * wallet contributes its full weight, and the product keeps the result below
 * 100 (the cap is enforced anyway).
 *
 * Weights:
 *   COMMON_FUNDER          0.55  strong   wallets share a first-SOL funder that is not an exchange/protocol
 *   DIRECT_TRANSFER        0.50  strong   wallets sent assets to each other
 *   ORIGIN_PROXIMITY       0.50  strong   wallet is 1-2 observed hops from the origin address
 *   REPEATED_INTERACTION   0.30  medium   two or more separate transfers between the same pair
 *   SHARED_COUNTERPARTY    0.25  medium   wallets transacted with the same uncommon counterparty
 *   SYNCHRONIZED_ENTRY     0.20  weak     first acquisitions within the sync window
 *   COMMON_WITHDRAWAL_SOURCE 0    info     shared exchange / protocol source; never implies ownership
 *
 * The overall signal is the highest cluster signal. It is null when the graph
 * could not be built from enough data (see walletGraph.ts).
 */

import { MASS } from "@/config/thresholds";
import type { RelationshipType, SignalComponent, WalletEdge } from "../types/scan";

export const RELATIONSHIP_WEIGHTS: Record<RelationshipType, number> = {
  COMMON_FUNDER: 0.55,
  DIRECT_TRANSFER: 0.5,
  ORIGIN_PROXIMITY: 0.5,
  REPEATED_INTERACTION: 0.3,
  SHARED_COUNTERPARTY: 0.25,
  SYNCHRONIZED_ENTRY: 0.2,
  COMMON_WITHDRAWAL_SOURCE: 0,
};

/** Synchronized-entry window in seconds (config/thresholds.ts). */
export const SYNC_WINDOW_SECONDS = MASS.syncWindowSeconds;

/** Per-type coverage and weight: the exact inputs of the signal. */
export function signalBreakdown(wallets: string[], edges: WalletEdge[]): SignalComponent[] {
  if (wallets.length < 2) return [];
  const members = new Set(wallets);
  const touched = new Map<RelationshipType, Set<string>>();
  for (const e of edges) {
    const set = touched.get(e.relationshipType) ?? new Set<string>();
    if (members.has(e.from)) set.add(e.from);
    if (members.has(e.to)) set.add(e.to);
    touched.set(e.relationshipType, set);
  }
  return [...touched]
    .map(([type, set]) => {
      const coverage = set.size / wallets.length;
      return { type, weight: RELATIONSHIP_WEIGHTS[type], coverage, points: Math.round(100 * RELATIONSHIP_WEIGHTS[type] * coverage) };
    })
    .sort((a, b) => b.points - a.points);
}

export function clusterSignal(wallets: string[], edges: WalletEdge[]): number | null {
  if (wallets.length < 2) return null;
  let remainder = 1;
  for (const c of signalBreakdown(wallets, edges)) remainder *= 1 - c.weight * c.coverage;
  return Math.min(100, Math.round((1 - remainder) * 100));
}
