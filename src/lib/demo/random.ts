/** Small deterministic PRNG so a given contract address always produces the same mock scan. */

export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rng = {
  next: () => number;
  range: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  chance: (p: number) => boolean;
};

export function createRng(seed: number): Rng {
  let s = seed || 1;
  const next = () => {
    // mulberry32
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
  };
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const HEX = "0123456789abcdef";

export function fakeAddress(rng: Rng, evm: boolean): string {
  if (evm) {
    let out = "0x";
    for (let i = 0; i < 40; i++) out += HEX[Math.floor(rng.next() * 16)];
    return out;
  }
  let out = "";
  const len = rng.int(43, 44);
  for (let i = 0; i < len; i++) out += BASE58[Math.floor(rng.next() * 58)];
  return out;
}
