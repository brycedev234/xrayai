/**
 * Solana address validation.
 *
 * A Solana public key is 32 bytes encoded as base58. Checking the character
 * set and length is not enough (many 32-44 char base58 strings decode to 31 or
 * 33 bytes), so the address is fully decoded and the byte length verified.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX: Record<string, number> = Object.fromEntries([...ALPHABET].map((c, i) => [c, i]));
const SHAPE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Decodes base58 to bytes, or returns null on an invalid character. */
export function decodeBase58(input: string): Uint8Array | null {
  let zeros = 0;
  while (zeros < input.length && input[zeros] === "1") zeros++;
  // Little-endian accumulator for the non-zero part.
  const acc: number[] = [];
  for (let k = zeros; k < input.length; k++) {
    const value = INDEX[input[k]];
    if (value === undefined) return null;
    let carry = value;
    for (let i = 0; i < acc.length; i++) {
      carry += acc[i] * 58;
      acc[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      acc.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const out = new Uint8Array(zeros + acc.length);
  for (let i = 0; i < acc.length; i++) out[zeros + i] = acc[acc.length - 1 - i];
  return out;
}

export function isSolanaAddress(value: string): boolean {
  if (!SHAPE.test(value)) return false;
  const bytes = decodeBase58(value);
  return bytes !== null && bytes.length === 32;
}
