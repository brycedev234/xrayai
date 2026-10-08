/**
 * Server-side feature switches. Read only from server code (API routes and
 * lib/providers). Nothing here is ever prefixed NEXT_PUBLIC_, so keys never
 * reach the browser bundle.
 *
 * Helius is the primary deep provider and is ON by default
 * (ENABLE_HELIUS=true in .env.example). Without HELIUS_API_KEY the app still
 * builds and scans: DexScreener + GoPlus answer, Helius reports
 * NOT CONFIGURED, and the result is a PARTIAL scan.
 */

export type HeliusState = "configured" | "missing_key" | "disabled";

export function heliusState(): HeliusState {
  if (process.env.ENABLE_HELIUS?.trim().toLowerCase() === "false") return "disabled";
  return process.env.HELIUS_API_KEY?.trim() ? "configured" : "missing_key";
}

export const features = {
  get helius(): boolean {
    return heliusState() === "configured";
  },
};

/** Server-only accessor. Returns null unless Helius is configured, so callers can't build URLs by accident. */
export function heliusApiKey(): string | null {
  return features.helius ? (process.env.HELIUS_API_KEY?.trim() ?? null) : null;
}
