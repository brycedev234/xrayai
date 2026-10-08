import assert from "node:assert/strict";
import { test } from "node:test";
import { activeSocials, socials } from "@/config/socials";
import { caseFileText } from "@/lib/analysis/caseFile";
import { demoOutcome, feedInfoFromHealth, feedInfoFromScan, isDemoAddress, requestScan } from "@/lib/client/scanClient";
import { MemoryRateLimiter, SCAN_LIMIT } from "@/lib/rateLimit/scanRateLimit";
import { DEMO_ADDRESS, demoScanResult } from "@/data/demoScanResult";

test("socials: blank URLs hidden, configured ones shown, unsafe schemes dropped", () => {
  assert.deepEqual(activeSocials(socials).map((s) => [s.key, s.url]), [["twitter", "https://x.com/xraydotio"]], "only X / Twitter ships");
  assert.equal(activeSocials({ twitter: "" }).length, 0, "blank hides it");
  assert.equal(activeSocials({ twitter: "javascript:alert(1)" }).length, 0, "unsafe schemes dropped");
});

test("rate limiter: 10 per minute per key, then 429-style refusal with retry-after", async () => {
  assert.deepEqual(SCAN_LIMIT, { max: 10, windowMs: 60_000 });
  const rl = new MemoryRateLimiter(SCAN_LIMIT.max, SCAN_LIMIT.windowMs);
  for (let i = 0; i < 10; i++) assert.equal((await rl.check("1.2.3.4")).allowed, true);
  const blocked = await rl.check("1.2.3.4");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
  assert.equal((await rl.check("5.6.7.8")).allowed, true, "other clients unaffected");
});

test("demo mode only for the explicit sample, and labelled as demo", async () => {
  assert.equal(isDemoAddress(DEMO_ADDRESS), true);
  const out = demoOutcome();
  assert.ok(out.ok);
  assert.equal(out.result.mode, "demo");
  assert.equal(out.result.caseFile.id, "0XR-84729");
  const text = caseFileText(out.result);
  for (const v of ["$184,291", "$612,487", "2.4%", "31.8%", "7.1%", "11 wallets", "17.8%", "RELATIONSHIP SIGNALS DETECTED", "SIMULATED"]) assert.ok(text.includes(v), v);
});

test("client never falls back to demo data when the API fails", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { code: "PROVIDER_UNAVAILABLE", message: "down" } }), { status: 503 })) as typeof fetch;
  try {
    const out = await requestScan("So11111111111111111111111111111111111111112");
    assert.equal(out.ok, false);
    assert.ok(!out.ok && out.error.title === "DATA PROVIDER TEMPORARILY UNAVAILABLE");
  } finally {
    globalThis.fetch = original;
  }
});

test("feed readout: per-provider state from health, never LIVE without all three", () => {
  const partial = feedInfoFromHealth({ status: "degraded", providers: { dexscreener: "available", goplus: "unavailable", helius: "not_configured" } }, 1);
  assert.equal(partial.state, "partial");
  assert.deepEqual(partial.sources.map((s) => [s.provider, s.state]), [["dexscreener", "up"], ["goplus", "down"], ["helius", "off"]]);
  assert.equal(partial.sources[2].detail, "NO API KEY ON SERVER");

  const live = feedInfoFromHealth({ status: "ok", providers: { dexscreener: "available", goplus: "available", helius: "configured" } }, 1);
  assert.equal(live.state, "live");
  assert.ok(live.sources.every((s) => s.state === "up"));

  assert.equal(feedInfoFromHealth(null, null).state, "checking");
  const down = feedInfoFromHealth(null, 1);
  assert.equal(down.state, "simulated");
  assert.equal(down.sources.length, 0);

  const demo = feedInfoFromScan(demoScanResult());
  assert.equal(demo.state, "simulated");
  assert.equal(demo.sources.length, 0);
});
