import { detectClusters } from "./clusters";
import { buildDiagnostics } from "./diagnostics";
import { hashString } from "./random";
import type { RawTokenData, Specimen } from "./specimenTypes";

/**
 * Builds the demo specimen the landing visuals render. Demo only: live scans
 * never pass through here (see lib/analysis/scanToken.ts).
 */
export function analyzeToken(raw: RawTokenData): Specimen {
  const clusters = detectClusters(raw);
  const { diagnostics, overall } = buildDiagnostics(raw, clusters);
  return {
    raw,
    clusters,
    primaryCluster: clusters[0],
    diagnostics,
    overall,
    scanId: `XR-${(hashString(raw.meta.address) % 0xfffff).toString(16).toUpperCase().padStart(5, "0")}`,
    scannedAt: Math.floor(Date.now() / 1000),
  };
}
