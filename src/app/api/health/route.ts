import { NextResponse } from "next/server";
import { cached, TTL } from "@/lib/cache/scanCache";
import { probeDexScreener } from "@/lib/providers/dexscreener";
import { probeGoPlus } from "@/lib/providers/goplus";
import { heliusStatus } from "@/lib/providers/helius";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Provider state only. Never includes keys, RPC URLs, environment values or
 * other configuration. DexScreener and GoPlus are probed (cached 60s so this
 * endpoint can't be used to hammer them); Helius reports whether it is
 * configured, without spending a request.
 *
 *   { "status": "ok" | "degraded", "providers": { "dexscreener", "goplus", "helius" } }
 */
export async function GET() {
  const probe = await cached("health:probe", TTL.health, async () => {
    const [dex, goplus] = await Promise.all([probeDexScreener(), probeGoPlus()]);
    return { dexscreener: dex ? "available" : "unavailable", goplus: goplus ? "available" : "unavailable" };
  });
  const providers = { ...probe.value, helius: heliusStatus() };
  const status = providers.dexscreener === "available" && providers.goplus === "available" && providers.helius === "configured" ? "ok" : "degraded";
  return NextResponse.json({ status, providers }, { headers: { "cache-control": "no-store" } });
}
