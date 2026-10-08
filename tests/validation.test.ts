import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeBase58, isSolanaAddress } from "@/lib/validation/solana";
import { detectAddressKind, validateScanRequest } from "@/lib/validation/address";

test("real Solana mints decode to 32 bytes", () => {
  for (const mint of [
    "So11111111111111111111111111111111111111112",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    "11111111111111111111111111111111",
    "1nc1nerator11111111111111111111111111111111",
  ]) {
    assert.equal(decodeBase58(mint)?.length, 32, mint);
    assert.equal(isSolanaAddress(mint), true, mint);
  }
});

test("base58-shaped strings with the wrong byte length are rejected", () => {
  assert.equal(isSolanaAddress("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"), false);
  assert.equal(isSolanaAddress("abc"), false);
  assert.equal(isSolanaAddress("0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl"), false);
});

test("auto-detect and request validation", () => {
  assert.equal(detectAddressKind("0x4e7a91c2b3f8d05a6e1c9b72f3a08d4c5e6b1f29"), "evm");
  assert.equal(detectAddressKind("So11111111111111111111111111111111111111112"), "solana");
  assert.equal(detectAddressKind("https://evil.example/So111"), null);

  const ok = validateScanRequest(" So11111111111111111111111111111111111111112 ", "auto");
  assert.deepEqual(ok, { ok: true, address: "So11111111111111111111111111111111111111112", chain: "solana" });

  const evm = validateScanRequest("0x4e7a91c2b3f8d05a6e1c9b72f3a08d4c5e6b1f29", "auto");
  assert.equal(evm.ok, false);
  assert.equal(!evm.ok && evm.code, "NETWORK_NOT_SUPPORTED");

  const evmChain = validateScanRequest("So11111111111111111111111111111111111111112", "base");
  assert.equal(!evmChain.ok && evmChain.code, "NETWORK_NOT_SUPPORTED");

  const url = validateScanRequest("https://example.com/token", "auto");
  assert.equal(!url.ok && url.code, "INVALID_CONTRACT");

  const badChain = validateScanRequest("So11111111111111111111111111111111111111112", "https://rpc.example");
  assert.equal(!badChain.ok && badChain.code, "BAD_REQUEST");

  assert.equal(validateScanRequest(42).ok, false);
  assert.equal(validateScanRequest("x".repeat(500)).ok, false);
});
