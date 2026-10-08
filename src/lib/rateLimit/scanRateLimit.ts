/**
 * Per-IP limiter for POST /api/scan: 10 scans / minute / IP by default
 * (config/thresholds.ts).
 *
 * The route depends only on the `RateLimiter` interface:
 * - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set → a shared fixed-window
 *   limiter in Upstash Redis (works across instances / serverless);
 * - otherwise, or if Upstash is unreachable → the in-memory sliding window
 *   (per instance; safe for development and single-instance hosting).
 * `setRateLimiter` swaps in any other implementation.
 */

import { RATE_LIMIT } from "@/config/thresholds";
import { upstashConfig, upstashPipeline, type UpstashConfig } from "../upstash";

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitDecision>;
}

export const SCAN_LIMIT = { max: RATE_LIMIT.scansPerWindow, windowMs: RATE_LIMIT.windowMs } as const;

export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs: number) {}

  async check(key: string): Promise<RateLimitDecision> {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return { allowed: true, remaining: this.max - recent.length, retryAfterSeconds: 0 };
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
  }
}

/** Fixed-window counter in Upstash Redis; falls back to memory when Upstash fails. */
export class UpstashRateLimiter implements RateLimiter {
  constructor(
    private readonly cfg: UpstashConfig,
    private readonly max: number,
    private readonly windowMs: number,
    private readonly fallback: RateLimiter,
  ) {}

  async check(key: string): Promise<RateLimitDecision> {
    const window = Math.floor(Date.now() / this.windowMs);
    const redisKey = `xray:rl:${key}:${window}`;
    try {
      const [count] = await upstashPipeline(this.cfg, [
        ["INCR", redisKey],
        ["PEXPIRE", redisKey, this.windowMs],
      ]);
      const n = Number(count);
      const retry = Math.max(1, Math.ceil(((window + 1) * this.windowMs - Date.now()) / 1000));
      return n > this.max ? { allowed: false, remaining: 0, retryAfterSeconds: retry } : { allowed: true, remaining: this.max - n, retryAfterSeconds: 0 };
    } catch {
      return this.fallback.check(key);
    }
  }
}

const memory = new MemoryRateLimiter(SCAN_LIMIT.max, SCAN_LIMIT.windowMs);
const upstash = upstashConfig();
let limiter: RateLimiter = upstash ? new UpstashRateLimiter(upstash, SCAN_LIMIT.max, SCAN_LIMIT.windowMs, memory) : memory;

export function setRateLimiter(next: RateLimiter) {
  limiter = next;
}

export function scanRateLimit(): RateLimiter {
  return limiter;
}

/** Best-effort client IP from proxy headers. Only used as a rate-limit key, never logged. */
export function clientKey(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || headers.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, 64);
}
