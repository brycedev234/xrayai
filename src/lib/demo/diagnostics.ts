import type { DiagnosticReading, RawTokenData, Specimen, Severity, WalletCluster } from "./specimenTypes";
import { formatPct, formatUsd } from "../format";

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function severityOf(intensity: number): Severity {
  if (intensity >= 62) return "elevated";
  if (intensity >= 36) return "watch";
  return "stable";
}

function reading(
  key: DiagnosticReading["key"],
  label: string,
  value: string,
  intensity: number,
  notes: string[],
): DiagnosticReading {
  const i = Math.round(clamp(intensity));
  return { key, label, value, intensity: i, severity: severityOf(i), notes };
}

function liquidity(data: RawTokenData): DiagnosticReading {
  const l = data.liquidity;
  const ratio = l.poolUsd / data.meta.marketCapUsd;
  const secured = Math.max(l.lpBurnedPct, l.lpLockedPct);
  let intensity = 70 - ratio * 220 - secured * 40 - l.change24h * 60;
  intensity = clamp(intensity, 4, 96);
  const notes = [
    `${formatUsd(l.poolUsd)} in ${l.dex}`,
    `Liquidity / mcap ${formatPct(ratio)}`,
    l.lpBurnedPct > 0
      ? `${formatPct(l.lpBurnedPct, 0)} of LP burned`
      : l.lpLockedPct > 0
        ? `${formatPct(l.lpLockedPct, 0)} of LP locked`
        : "LP not locked or burned",
    `24h liquidity ${l.change24h >= 0 ? "+" : ""}${formatPct(l.change24h)}`,
  ];
  return reading("liquidity", "Liquidity health", 100 - Math.round(intensity) + "/100", intensity, notes);
}

function concentration(data: RawTokenData): DiagnosticReading {
  const wallets = data.holders.filter((h) => !h.tags.includes("pool") && !h.tags.includes("burn"));
  const top10 = wallets.slice(0, 10).reduce((s, h) => s + h.pct, 0);
  const top1 = wallets[0]?.pct ?? 0;
  const intensity = top10 * 210 + top1 * 120 - 8;
  return reading("concentration", "Holder concentration", `Top 10 · ${formatPct(top10)}`, intensity, [
    `Largest wallet ${formatPct(top1)}`,
    `${data.holders.length} wallets indexed`,
    `Pool holds ${formatPct(data.holders.find((h) => h.tags.includes("pool"))?.pct ?? 0)}`,
  ]);
}

function creatorHistory(data: RawTokenData): DiagnosticReading {
  const c = data.creator;
  const drained = c.priorDeployments.filter((d) => d.liquidityRetained < 0.1).length;
  const total = c.priorDeployments.length;
  const intensity = (total ? drained / total : 0) * 70 + c.soldPct * 300 + (total > 4 ? 10 : 0);
  return reading("creator", "Creator history", `${total} prior deployments`, intensity, [
    `${drained} of ${total} retained under 10% of peak liquidity`,
    `Deployer holds ${formatPct(c.holdsPct)} · sold ${formatPct(c.soldPct)}`,
    c.fundingLabel ?? "Funding source unknown",
  ]);
}

function cluster(primary: WalletCluster | undefined, all: WalletCluster[]): DiagnosticReading {
  if (!primary) {
    return reading("cluster", "Cluster risk", "No cluster", 8, ["No connected wallet groups above threshold"]);
  }
  const intensity = primary.confidence * 60 + primary.combinedPct * 180;
  return reading("cluster", "Cluster risk", `${primary.members.length} linked · ${formatPct(primary.combinedPct)}`, intensity, [
    `Relationship confidence ${Math.round(primary.confidence * 100)}%`,
    `${all.length} connected group${all.length === 1 ? "" : "s"} detected`,
    primary.creatorLinked ? `${primary.creatorLinked} linked to deployer` : "No direct deployer link",
  ]);
}

function flow(data: RawTokenData, primary: WalletCluster | undefined): DiagnosticReading {
  const buys = data.trades.filter((t) => t.side === "buy");
  const sells = data.trades.filter((t) => t.side === "sell");
  const buyUsd = buys.reduce((s, t) => s + t.usd, 0);
  const sellUsd = sells.reduce((s, t) => s + t.usd, 0);
  const members = new Set(primary?.members.map((m) => m.address) ?? []);
  const clusterSell = sells.filter((t) => members.has(t.wallet)).reduce((s, t) => s + t.usd, 0);
  const clusterShare = sellUsd ? clusterSell / sellUsd : 0;
  const pressure = sellUsd / Math.max(1, buyUsd + sellUsd);
  const intensity = (pressure - 0.4) * 160 + clusterShare * 90;
  return reading("flow", "Transaction behavior", `${data.trades.length} tx · 24h`, intensity, [
    `Buy ${formatUsd(buyUsd)} / Sell ${formatUsd(sellUsd)}`,
    `Linked wallets: ${formatPct(clusterShare)} of sell volume`,
    `${new Set(data.trades.map((t) => t.wallet)).size} unique traders`,
  ]);
}

export function buildDiagnostics(data: RawTokenData, clusters: WalletCluster[]): Pick<Specimen, "diagnostics" | "overall"> {
  const primary = clusters[0];
  const diagnostics = [
    liquidity(data),
    concentration(data),
    creatorHistory(data),
    cluster(primary, clusters),
    flow(data, primary),
  ];
  const weights = { liquidity: 0.22, concentration: 0.18, creator: 0.18, cluster: 0.28, flow: 0.14 };
  const score = Math.round(diagnostics.reduce((s, d) => s + d.intensity * weights[d.key], 0));
  const elevated = diagnostics.filter((d) => d.severity === "elevated").length;
  const severity: Severity = score >= 55 || elevated >= 2 ? "elevated" : score >= 34 || elevated >= 1 ? "watch" : "stable";
  const label =
    severity === "elevated" ? "Anomalous structure detected" : severity === "watch" ? "Irregularities noted" : "No major anomalies";
  return { diagnostics, overall: { severity, label, score } };
}
