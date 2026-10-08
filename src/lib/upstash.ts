/**
 * Minimal Upstash Redis REST client (no SDK), used only when
 * UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set on the server.
 * The URL comes from server configuration, never from a user, and must be
 * https. Errors never include the URL or token.
 */

export interface UpstashConfig {
  url: string;
  token: string;
}

export function upstashConfig(): UpstashConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token || !/^https:\/\/[^/\s]+\/?$/.test(url)) return null;
  return { url: url.replace(/\/$/, ""), token };
}

/** Runs commands in one round trip. Throws a generic error on any failure. */
export async function upstashPipeline(cfg: UpstashConfig, commands: (string | number)[][], timeoutMs = 1500): Promise<unknown[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
      body: JSON.stringify(commands),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error("upstash unavailable");
    const body = (await res.json()) as { result?: unknown; error?: string }[];
    if (!Array.isArray(body) || body.some((r) => r.error)) throw new Error("upstash unavailable");
    return body.map((r) => r.result);
  } catch {
    throw new Error("upstash unavailable");
  } finally {
    clearTimeout(timer);
  }
}
