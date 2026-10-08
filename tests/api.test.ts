import assert from "node:assert/strict";
import { test } from "node:test";
import { GET as health } from "@/app/api/health/route";
import { POST as scan } from "@/app/api/scan/route";
import { addr, dexPairs, goplusBody, mockFetch } from "./helpers";

const post = (body: unknown, ip = addr()) =>
  scan(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body) }));

test("/api/health: provider states only, never keys or URLs", async () => {
  process.env.HELIUS_API_KEY = "health-secret-key";
  const m = mockFetch((u) => (u.startsWith("https://api.dexscreener.com/") ? [] : { code: 1, result: {} }));
  try {
    const res = await health();
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { status: "ok", providers: { dexscreener: "available", goplus: "available", helius: "configured" } });
    assert.equal(text.includes("health-secret-key"), false);
    assert.doesNotMatch(text, /https?:|api-key|HELIUS_API_KEY/);
  } finally {
    m.restore();
    process.env.HELIUS_API_KEY = "";
  }
  const res = await health();
  assert.deepEqual(await res.json(), { status: "degraded", providers: { dexscreener: "available", goplus: "available", helius: "not_configured" } });
});

test("POST /api/scan: malformed input rejected before any provider call", async () => {
  const m = mockFetch(() => {
    throw new Error("must not fetch");
  });
  try {
    for (const [body, code] of [
      [{ address: "not-a-mint" }, "INVALID_CONTRACT"],
      [{ address: "https://evil.example/x" }, "INVALID_CONTRACT"],
      [{ address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933" }, "NETWORK_NOT_SUPPORTED"],
      ["{bad json", "BAD_REQUEST"],
      [[1, 2], "BAD_REQUEST"],
    ] as const) {
      const res = await post(body);
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, code, JSON.stringify(body));
      assert.doesNotMatch(json.error.message, /at .+\(|stack|Error:/);
    }
    assert.equal(m.calls.length, 0);
  } finally {
    m.restore();
  }
});

test("POST /api/scan: valid mint returns a ScanResult; the 11th scan in a minute is rate limited", async () => {
  const mint = addr();
  const ip = "203.0.113.7";
  const m = mockFetch((u) => (u.startsWith("https://api.dexscreener.com/") ? dexPairs(mint) : goplusBody(mint)));
  try {
    const first = await post({ address: mint }, ip);
    assert.equal(first.status, 200);
    const r = (await first.json()) as { mode: string; address: string; caseFile: { id: string } };
    assert.equal(r.address, mint);
    assert.equal(r.mode, "partial", "no Helius key in tests");
    for (let i = 0; i < 9; i++) assert.equal((await post({ address: mint }, ip)).status, 200);
    const limited = await post({ address: mint }, ip);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    assert.equal(((await limited.json()) as { error: { code: string } }).error.code, "RATE_LIMITED");
  } finally {
    m.restore();
  }
});
