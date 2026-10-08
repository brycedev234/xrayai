/**
 * Browser-side scan client. Talks only to our own /api routes; provider calls
 * and keys stay on the server.
 *
 * Demo data is returned ONLY for the explicit sample. Any other failure is
 * surfaced as an error; there is no silent fallback to example numbers.
 */

import type { ScanErrorBody, ScanErrorCode, ScanResult } from "@/lib/types/scan";
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
