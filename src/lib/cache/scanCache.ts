/**
 * Small TTL cache with in-flight de-duplication.
 *
 * The `CacheStore` interface is what the providers depend on. With
 * UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set, values are shared
 * through Upstash Redis (so 100 users scanning one token, on any instance,
 * cost one wallet analysis); otherwise, or when Upstash fails, the in-memory
 * store is used. Only successful values are cached; failures are never stored.
 */

import { upstashConfig, upstashPipeline, type UpstashConfig } from "../upstash";

export interface CacheStore {
  get<T>(key: string): Promise<{ value: T; storedAt: number } | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
}

class MemoryStore implements CacheStore {
  private map = new Map<string, { value: unknown; storedAt: number; expires: number }>();
  private readonly max = 2000;

  async get<T>(key: string) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return { value: hit.value as T, storedAt: hit.storedAt };
  }

  async set<T>(key: string, value: T, ttlMs: number) {
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, storedAt: Date.now(), expires: Date.now() + ttlMs });
  }
}

/** TTLs in milliseconds. */
export const TTL = {
  market: 20_000, // DexScreener: 15-30s
  security: 120_000, // GoPlus: 1-5 min
  tokenConfig: 10 * 60_000, // mint / authorities: 5-15 min
  holders: 60_000,
  transactions: 45_000, // transaction flow: 30-60s
  graph: 3 * 60_000, // wallet graph: 2-5 min
  funder: 24 * 3600_000, // a wallet's first funder never changes
  identity: 24 * 3600_000,
  health: 60_000,
} as const;

/** Upstash-backed store with the memory store as a dev-safe fallback. */
class UpstashStore implements CacheStore {
  constructor(
    private readonly cfg: UpstashConfig,
    private readonly fallback: CacheStore,
  ) {}

  async get<T>(key: string) {
    try {
      const [raw] = await upstashPipeline(this.cfg, [["GET", `xray:c:${key}`]]);
      if (typeof raw !== "string") return this.fallback.get<T>(key);
      return JSON.parse(raw) as { value: T; storedAt: number };
    } catch {
      return this.fallback.get<T>(key);
    }
  }

  async set<T>(key: string, value: T, ttlMs: number) {
    await this.fallback.set(key, value, ttlMs);
    try {
      await upstashPipeline(this.cfg, [["SET", `xray:c:${key}`, JSON.stringify({ value, storedAt: Date.now() }), "PX", ttlMs]]);
    } catch {
      /* memory copy already stored */
    }
  }
}

const upstash = upstashConfig();
let store: CacheStore = upstash ? new UpstashStore(upstash, new MemoryStore()) : new MemoryStore();
const inflight = new Map<string, Promise<unknown>>();

export function setCacheStore(next: CacheStore) {
  store = next;
}

export interface Cached<T> {
  value: T;
  cached: boolean;
  fetchedAt: string;
}

/**
 * Returns the cached value or runs `load`. `shouldCache` lets callers skip
 * storing empty/failed results.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  shouldCache: (value: T) => boolean = () => true,
): Promise<Cached<T>> {
  const hit = await store.get<T>(key);
  if (hit) return { value: hit.value, cached: true, fetchedAt: new Date(hit.storedAt).toISOString() };

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return { value: await pending, cached: false, fetchedAt: new Date().toISOString() };

  const run = load();
  inflight.set(key, run);
  try {
    const value = await run;
    if (shouldCache(value)) await store.set(key, value, ttlMs);
    return { value, cached: false, fetchedAt: new Date().toISOString() };
  } finally {
    inflight.delete(key);
  }
}
