/**
 * Request validation for the scanner. Shared by the API route and the client
 * so the input chip, the error copy and the server agree.
 *
 * Only contract addresses and a fixed set of chain names are accepted. No URLs,
 * no free text.
 */

import { isEvmAddress } from "./evm";
import { isSolanaAddress } from "./solana";

export type AddressKind = "solana" | "evm";

/** Chains the scanner understands. Only Solana is enabled right now. */
export const SUPPORTED_CHAINS = ["solana"] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

/** EVM chain names recognized so the API can answer NETWORK_NOT_SUPPORTED instead of INVALID_CONTRACT. */
export const KNOWN_EVM_CHAINS = ["ethereum", "base", "arbitrum", "bsc", "polygon", "optimism", "avalanche"] as const;

export const CHAIN_VALUES = ["auto", ...SUPPORTED_CHAINS, ...KNOWN_EVM_CHAINS] as const;
export type ChainValue = (typeof CHAIN_VALUES)[number];

export function detectAddressKind(value: string): AddressKind | null {
  const v = value.trim();
  if (isSolanaAddress(v)) return "solana";
  if (isEvmAddress(v)) return "evm";
  return null;
}

export type ValidationResult =
  | { ok: true; address: string; chain: SupportedChain }
  | { ok: false; code: "INVALID_CONTRACT" | "NETWORK_NOT_SUPPORTED" | "BAD_REQUEST"; message: string };

const MAX_INPUT = 128;

/** Validates an untrusted `{ address, chain }` pair. */
export function validateScanRequest(address: unknown, chain: unknown = "auto"): ValidationResult {
  if (typeof address !== "string" || address.length === 0 || address.length > MAX_INPUT) {
    return { ok: false, code: "INVALID_CONTRACT", message: "Paste a token contract address." };
  }
  const chainValue = typeof chain === "string" ? chain.trim().toLowerCase() : chain;
  if (typeof chainValue !== "string" || !(CHAIN_VALUES as readonly string[]).includes(chainValue)) {
    return { ok: false, code: "BAD_REQUEST", message: "Unknown chain value." };
  }
  const trimmed = address.trim();
  const kind = detectAddressKind(trimmed);

  if ((KNOWN_EVM_CHAINS as readonly string[]).includes(chainValue) || (chainValue === "auto" && kind === "evm")) {
    if (kind === "evm" || chainValue !== "auto") {
      return {
        ok: false,
        code: "NETWORK_NOT_SUPPORTED",
        message: "EVM support is not enabled yet. Paste a Solana mint address.",
      };
    }
  }
  if (kind !== "solana") {
    return {
      ok: false,
      code: "INVALID_CONTRACT",
      message: "Not a valid Solana mint address. Expected a 32-byte base58 public key.",
    };
  }
  return { ok: true, address: trimmed, chain: "solana" };
}
