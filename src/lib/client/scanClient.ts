/**
 * Browser-side scan client. Talks only to our own /api routes; provider calls
 * and keys stay on the server.
 *
 * Demo data is returned ONLY for the explicit sample. Any other failure is
 * surfaced as an error; there is no silent fallback to example numbers.
 */

import type { ProviderId, ScanErrorBody, ScanErrorCode, ScanResult, SourceResult } from "@/lib/types/scan";
import { DEMO_ADDRESS, demoScanResult } from "@/data/demoScanResult";

/** Set by scripts/build-preview.mjs for the static, server-less preview. */
export const IS_STATIC_PREVIEW = process.env.XRAY_STATIC_PREVIEW === "1";

export interface ClientScanError {
  code: ScanErrorCode | "NETWORK" | "STATIC_PREVIEW";
  title: string;
  message: string;
}

export type ClientScanOutcome = { ok: true; result: ScanResult } | { ok: false; error: ClientScanError };

const TITLES: Record<ClientScanError["code"], string> = {
  INVALID_CONTRACT: "INVALID CONTRACT",
  TOKEN_NOT_FOUND: "TOKEN NOT FOUND",
  NETWORK_NOT_SUPPORTED: "NETWORK NOT SUPPORTED",
  PROVIDER_UNAVAILABLE: "DATA PROVIDER TEMPORARILY UNAVAILABLE",
  RATE_LIMITED: "RATE LIMIT REACHED — RETRY SHORTLY",
  BAD_REQUEST: "INVALID REQUEST",
  INTERNAL: "SCAN FAILED",
  NETWORK: "SCANNER UNREACHABLE",
  STATIC_PREVIEW: "LIVE BACKEND NOT IN THIS PREVIEW",
};

export function scanError(code: ClientScanError["code"], message: string): ClientScanError {
  return { code, title: TITLES[code], message };
}

export const isDemoAddress = (address: string) => address.trim() === DEMO_ADDRESS;

export function demoOutcome(): ClientScanOutcome {
  return { ok: true, result: demoScanResult() };
}

export async function requestScan(address: string, signal?: AbortSignal): Promise<ClientScanOutcome> {
  if (isDemoAddress(address)) return demoOutcome();
  if (IS_STATIC_PREVIEW) {
    return {
      ok: false,
      error: scanError("STATIC_PREVIEW", "This preview has no server, so it cannot call Helius, DexScreener or GoPlus. Deploy the app to scan live tokens, or try the sample."),
    };
  }
  let res: Response;
  try {
    res = await fetch("/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: address.trim() }),
      signal,
    });
  } catch {
    return { ok: false, error: scanError("NETWORK", "Could not reach the scanner. Check your connection and retry.") };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* handled below */
  }
  if (!res.ok) {
    const err = (body as ScanErrorBody | null)?.error;
    const code = err?.code && err.code in TITLES ? err.code : res.status === 429 ? "RATE_LIMITED" : "INTERNAL";
    return { ok: false, error: scanError(code, err?.message ?? "The scan failed. Retry shortly.") };
  }
  const result = body as ScanResult | null;
  if (!result || (result.mode !== "live" && result.mode !== "partial")) {
    return { ok: false, error: scanError("INTERNAL", "The scanner returned an unreadable result.") };
  }
  return { ok: true, result };
}

export type FeedState = "live" | "partial" | "simulated" | "checking";

export interface HealthState {
  status: "ok" | "degraded";
  providers: { dexscreener: string; goplus: string; helius: string };
}

/** Provider health for the nav indicator. Static preview never reports LIVE. */
export async function fetchHealth(): Promise<HealthState | null> {
  if (IS_STATIC_PREVIEW) return null;
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HealthState;
  } catch {
    return null;
  }
}

/** LIVE only when all three providers are up; PARTIAL when the market feed works but something else doesn't. */
export function feedFromHealth(h: HealthState | null): FeedState {
  const p = h?.providers;
  if (!p) return "simulated";
  if (p.dexscreener === "available" && p.goplus === "available" && p.helius === "configured") return "live";
  return p.dexscreener === "available" || p.goplus === "available" ? "partial" : "simulated";
}

/** One provider row in the feed readout. */
export interface FeedSource {
  provider: ProviderId;
  state: "up" | "down" | "off";
  detail: string;
}

/** What the feed indicator shows when opened. */
export interface FeedInfo {
  state: FeedState;
  sources: FeedSource[];
  note: string;
  checkedAt: number | null;
  recheck?: () => void;
}

const PROVIDER_ROLE: Record<ProviderId, string> = {
  dexscreener: "MARKET · LIQUIDITY",
  goplus: "CONTRACT SECURITY",
  helius: "HOLDERS · WALLET GRAPH",
};

const FEED_NOTE: Record<FeedState, string> = {
  live: "All providers answering. Scans read live chain data.",
  partial: "Some providers are missing. Scans still run, and the case file marks every section it could not read.",
  simulated: "No live providers. Only the sample scan runs.",
  checking: "Checking providers.",
};

/** Feed readout from /api/health. */
export function feedInfoFromHealth(h: HealthState | null, checkedAt: number | null): FeedInfo {
  const state = checkedAt === null ? "checking" : feedFromHealth(h);
  if (!h) {
    const note = checkedAt === null ? FEED_NOTE.checking : IS_STATIC_PREVIEW ? "Preview build with no backend. Only the sample scan runs here." : "Scanner backend not reachable. Only the sample scan runs.";
    return { state, sources: [], note, checkedAt };
  }
  const up = (v: string) => v === "available";
  const sources: FeedSource[] = [
    { provider: "dexscreener", state: up(h.providers.dexscreener) ? "up" : "down", detail: up(h.providers.dexscreener) ? PROVIDER_ROLE.dexscreener : "NOT RESPONDING" },
    { provider: "goplus", state: up(h.providers.goplus) ? "up" : "down", detail: up(h.providers.goplus) ? PROVIDER_ROLE.goplus : "NOT RESPONDING" },
    {
      provider: "helius",
      state: h.providers.helius === "configured" ? "up" : "off",
      detail: h.providers.helius === "configured" ? PROVIDER_ROLE.helius : h.providers.helius === "disabled" ? "DISABLED ON SERVER" : "NO API KEY ON SERVER",
    },
  ];
  return { state, sources, note: FEED_NOTE[state], checkedAt };
}

/** Feed readout for a finished scan, from the sources it actually used. */
export function feedInfoFromScan(result: ScanResult): FeedInfo {
  const state: FeedState = result.mode === "demo" ? "simulated" : result.mode === "partial" ? "partial" : "live";
  if (result.mode === "demo") return { state, sources: [], note: "Sample scan. Every value comes from example data.", checkedAt: Date.parse(result.caseFile.createdAt) || null };
  const order: ProviderId[] = ["dexscreener", "goplus", "helius"];
  const sources = order
    .map((provider) => sourceRow(provider, result.sources.filter((s) => s.provider === provider)))
    .filter((s): s is FeedSource => s !== null);
  const note = state === "live" ? "Every provider answered for this scan." : "Some providers did not answer for this scan. Their sections read UNAVAILABLE.";
  return { state, sources, note, checkedAt: Date.parse(result.caseFile.createdAt) || null };
}

function sourceRow(provider: ProviderId, rows: SourceResult[]): FeedSource | null {
  if (rows.length === 0) return null;
  const failed = rows.find((r) => r.status === "error");
  if (failed) return { provider, state: "down", detail: (failed.note ?? "FAILED").toUpperCase() };
  if (rows.some((r) => r.status === "not_configured")) return { provider, state: "off", detail: provider === "helius" ? "NO API KEY ON SERVER" : "NOT CONFIGURED" };
  return { provider, state: "up", detail: rows.map((r) => r.scope.toUpperCase()).join(" · ") };
}
