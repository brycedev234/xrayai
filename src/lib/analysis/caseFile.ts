/**
 * CASE FILE: id, sections and shareable text, generated from a ScanResult.
 * Missing values render as "—". Example numbers only ever appear when the
 * result itself is the labelled demo result.
 */

import * as d from "../display";
import type { ScanResult } from "../types/scan";

/** Deterministic case id from chain + address, e.g. 0XR-84729. */
export function caseId(chain: string, address: string): string {
  let h = 0x811c9dc5;
  for (const ch of `${chain}:${address}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `0XR-${10000 + (h % 90000)}`;
}

export interface CaseFileRow {
  label: string;
  value: string;
  anomaly?: boolean;
}

export interface CaseFileSection {
  organ: "GENOME" | "HEART" | "BRAIN" | "CELLS" | "MASS";
  rows: CaseFileRow[];
  anomaly?: boolean;
}

export function caseFileSections(r: ScanResult): CaseFileSection[] {
  const helius = r.mass.heliusEnhanced;
  const anyAuthority = r.genome.mintAuthorityActive === null && r.genome.freezeAuthorityActive === null ? null : Boolean(r.genome.mintAuthorityActive || r.genome.freezeAuthorityActive);
  const lb = (k: "top1" | "top10") => r.cells.lowerBounds.includes(k);
  const largest = r.mass.clusters[0];
  const massRows: CaseFileRow[] = helius
    ? [
        { label: "Clusters detected", value: r.mass.graphState === "INSUFFICIENT_GRAPH_DATA" ? d.DASH : String(r.mass.clusters.length), anomaly: r.mass.clusters.length > 0 },
        { label: "Largest cluster", value: largest ? `${largest.wallets.length} wallets` : d.DASH, anomaly: Boolean(largest) },
        { label: "Combined supply", value: d.pct(largest?.combinedSupplyPercent ?? null), anomaly: Boolean(largest) },
      ]
    : [
        { label: "Clusters detected", value: d.DASH },
        { label: "Wallet graph", value: "NOT ENABLED" },
      ];

  return [
    {
      organ: "GENOME",
      rows: [
        { label: "Mint authority", value: d.authority(r.genome.mintAuthorityActive, d.DASH), anomaly: r.genome.mintAuthorityActive === true },
        { label: "Freeze authority", value: d.authority(r.genome.freezeAuthorityActive, d.DASH), anomaly: r.genome.freezeAuthorityActive === true },
        { label: "Token program", value: r.genome.tokenProgram ?? d.DASH },
      ],
    },
    {
      organ: "HEART",
      rows: [
        { label: "Liquidity", value: d.usd(r.heart.liquidityUsd) },
        { label: "24H volume", value: d.usd(r.heart.volume24h) },
      ],
    },
    {
      organ: "BRAIN",
      rows: [
        { label: "Origin share", value: d.pct(r.brain.originSupplyPercent) },
        { label: "Origin authority", value: d.authority(anyAuthority, d.DASH), anomaly: anyAuthority === true },
      ],
    },
    {
      organ: "CELLS",
      rows: [
        { label: "Top 10 concentration", value: d.pct(r.cells.top10Percent, 1, { lowerBound: lb("top10") }) },
        { label: "Largest holder", value: d.pct(r.cells.top1Percent, 1, { lowerBound: lb("top1") }) },
      ],
    },
    { organ: "MASS", anomaly: r.mass.clusters.length > 0, rows: massRows },
  ];
}

export function caseAgeSeconds(r: ScanResult): number | null {
  return r.token.ageSeconds;
}

/** Plain-text case file for sharing. */
export function caseFileText(r: ScanResult): string {
  const line = (label: string, value: string) => `${label} ${".".repeat(Math.max(3, 24 - label.length))} ${value}`;
  const head = [
    `CASE     ${r.caseFile.id}`,
    `TOKEN    ${r.token.symbol ? `$${r.token.symbol}` : d.DASH}`,
    `CHAIN    ${r.chain.toUpperCase()}`,
    `AGE      ${d.age(r.token.ageSeconds)}`,
    `FEED     ${r.mode === "demo" ? "SIMULATED (DEMO DATA)" : r.mode === "partial" ? "PARTIAL" : "LIVE"}`,
  ];
  const body = caseFileSections(r).flatMap((s) => ["", s.organ, ...s.rows.map((row) => line(row.label, row.value))]);
  return [
    "ONCHAIN X-RAY · CASE FILE",
    "",
    ...head,
    ...body,
    "",
    "VERDICT",
    r.caseFile.verdict.label,
    r.caseFile.verdict.summary,
    "",
    "STATUS",
    r.caseFile.status,
    ...(r.findings.length ? ["", "FINDINGS", ...r.findings.filter((f) => f.organ !== "SCAN").slice(0, 12).map((f) => `· ${f.label}`)] : []),
    "",
    r.mode === "demo" ? "Demo radiography. Example values, not a live scan." : `Contract ${r.address}`,
    "Relationship indicators, not verdicts.",
  ].join("\n");
}
