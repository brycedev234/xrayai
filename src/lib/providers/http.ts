/**
 * Fetch helper for provider calls: fixed base URLs only, a hard timeout via
 * AbortController, JSON parsing, and errors that never carry the request URL
 * (which may contain an API key).
 */

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly kind: "timeout" | "http" | "network" | "parse",
    public readonly status?: number,
  ) {
    super(`${provider}: ${kind}${status ? ` ${status}` : ""}`);
    this.name = "ProviderError";
  }
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
}

export async function fetchJson<T>(provider: string, url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 6000);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onOuterAbort);
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: { accept: "application/json", ...(opts.body ? { "content-type": "application/json" } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });
    } catch {
      throw new ProviderError(provider, controller.signal.aborted ? "timeout" : "network");
    }
    if (!res.ok) throw new ProviderError(provider, "http", res.status);
    try {
      return (await res.json()) as T;
    } catch {
      throw new ProviderError(provider, "parse");
    }
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}

/** User-safe description of a provider failure. */
export function describeFailure(err: unknown): string {
  if (err instanceof ProviderError) {
    if (err.kind === "timeout") return "timed out";
    if (err.kind === "http") return err.status === 429 ? "rate limited" : `responded ${err.status}`;
    if (err.kind === "parse") return "returned unreadable data";
    return "unreachable";
  }
  return "failed";
}

/** Runs async tasks with a concurrency cap, so per-wallet lookups never fan out unbounded. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
