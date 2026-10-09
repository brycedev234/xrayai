/**
 * Case-file status, derived only from findings.
 *
 * Each finding may support one status. Every supported status becomes a flag;
 * the headline is the first one in PRIORITY. With no structural finding the
 * headline is NO MAJOR STRUCTURAL FLAGS DETECTED, unless the scan is partial
 * (missing data can't support "no flags"). The engine never outputs SAFE,
 * SCAM, RUG or any guarantee.
 */

import type { Finding, ScanMode, StatusCode, StatusFlag, Verdict } from "../types/scan";

const LABEL: Record<StatusCode, string> = {
  ANOMALOUS_STRUCTURE_DETECTED: "ANOMALOUS STRUCTURE DETECTED",
  RELATIONSHIP_SIGNALS_DETECTED: "RELATIONSHIP SIGNALS DETECTED",
  PRIVILEGED_AUTHORITY_ACTIVE: "PRIVILEGED AUTHORITY ACTIVE",
  HIGH_HOLDER_CONCENTRATION: "HIGH HOLDER CONCENTRATION",
  LOW_LIQUIDITY: "LOW LIQUIDITY",
  PARTIAL_SCAN: "PARTIAL SCAN",
  INSUFFICIENT_DATA: "INSUFFICIENT DATA",
  NO_MAJOR_STRUCTURAL_FLAGS_DETECTED: "NO MAJOR STRUCTURAL FLAGS DETECTED",
};

const TONE: Record<StatusCode, StatusFlag["tone"]> = {
  ANOMALOUS_STRUCTURE_DETECTED: "anomaly",
  RELATIONSHIP_SIGNALS_DETECTED: "anomaly",
  PRIVILEGED_AUTHORITY_ACTIVE: "anomaly",
  HIGH_HOLDER_CONCENTRATION: "watch",
  LOW_LIQUIDITY: "watch",
  PARTIAL_SCAN: "watch",
  INSUFFICIENT_DATA: "watch",
  NO_MAJOR_STRUCTURAL_FLAGS_DETECTED: "neutral",
};

export const PRIORITY: StatusCode[] = [
  "ANOMALOUS_STRUCTURE_DETECTED",
  "RELATIONSHIP_SIGNALS_DETECTED",
  "PRIVILEGED_AUTHORITY_ACTIVE",
  "HIGH_HOLDER_CONCENTRATION",
  "LOW_LIQUIDITY",
  "INSUFFICIENT_DATA",
  "PARTIAL_SCAN",
  "NO_MAJOR_STRUCTURAL_FLAGS_DETECTED",
];

export function evaluateStatus(findings: Finding[], mode: ScanMode): { statusCode: StatusCode; status: string; flags: StatusFlag[] } {
  const support = new Map<StatusCode, string[]>();
  for (const f of findings) if (f.status) support.set(f.status, [...(support.get(f.status) ?? []), f.label]);
  if (mode === "partial" && !support.has("PARTIAL_SCAN")) support.set("PARTIAL_SCAN", ["One or more data providers did not respond."]);
  if (!support.size) support.set("NO_MAJOR_STRUCTURAL_FLAGS_DETECTED", ["No authority, concentration, liquidity or relationship flags in the observed data."]);

  const flags: StatusFlag[] = [...support]
    .sort(([a], [b]) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b))
    .map(([code, labels]) => ({ code, label: LABEL[code], tone: TONE[code], detail: labels.join(" · ") }));
  const head = flags[0];
  return { statusCode: head.code, status: head.label, flags };
}

/**
 * VERDICT: a quick answer to "is this token good or not?", in red flags.
 *
 *   SERIOUS RED FLAGS   anomalous wallet structure, or an active privileged
 *                       authority (mint / freeze / transfer hook / frozen accounts),
 *                       or three or more flagged areas at once
 *   SOME RED FLAGS      connected holders, high concentration or low liquidity
 *   FEW RED FLAGS       a complete (LIVE) scan with none of the above
 *   NOT ENOUGH DATA     a partial or thin scan with nothing flagged
 *
 * It never says SAFE: on-chain data can show red flags, not their absence of
 * risk (a clean token can still be dumped by a fresh wallet tomorrow).
 */
export function evaluateVerdict(findings: Finding[], flags: StatusFlag[], mode: ScanMode): Verdict {
  const codes = new Set(flags.map((f) => f.code));
  const reasons = findings.filter((f) => f.status && f.status !== "PARTIAL_SCAN" && f.status !== "INSUFFICIENT_DATA").map((f) => f.label);
  const flagged = ["ANOMALOUS_STRUCTURE_DETECTED", "RELATIONSHIP_SIGNALS_DETECTED", "PRIVILEGED_AUTHORITY_ACTIVE", "HIGH_HOLDER_CONCENTRATION", "LOW_LIQUIDITY"].filter((c) => codes.has(c as StatusCode));

  if (codes.has("ANOMALOUS_STRUCTURE_DETECTED") || codes.has("PRIVILEGED_AUTHORITY_ACTIVE") || flagged.length >= 3) {
    return { level: "SERIOUS_RED_FLAGS", label: "SERIOUS RED FLAGS", summary: `${flagged.length} flagged area${flagged.length > 1 ? "s" : ""}, including control or linked-wallet signals.`, reasons };
  }
  if (flagged.length) {
    return { level: "SOME_RED_FLAGS", label: "SOME RED FLAGS", summary: `${flagged.length} flagged area${flagged.length > 1 ? "s" : ""} worth checking before buying.`, reasons };
  }
  if (mode === "live" && !codes.has("INSUFFICIENT_DATA")) {
    return { level: "FEW_RED_FLAGS", label: "FEW RED FLAGS FOUND", summary: `No major structural red flags in the data read. That is not a guarantee.`, reasons: [] };
  }
  return { level: "NOT_ENOUGH_DATA", label: "NOT ENOUGH DATA FOR A VERDICT", summary: `Nothing flagged, but part of the scan is missing, so a clean result means little.`, reasons: [] };
}

export function statusLabel(code: StatusCode): string {
  return LABEL[code];
}
