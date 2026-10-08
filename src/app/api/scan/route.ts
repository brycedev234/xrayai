import { NextResponse } from "next/server";
import { scanToken } from "@/lib/analysis/scanToken";
import { clientKey, scanRateLimit } from "@/lib/rateLimit/scanRateLimit";
import type { ScanErrorBody, ScanErrorCode } from "@/lib/types/scan";
import { validateScanRequest } from "@/lib/validation/address";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;

function fail(status: number, code: ScanErrorCode, message: string, headers?: Record<string, string>) {
  return NextResponse.json<ScanErrorBody>({ error: { code, message } }, { status, headers: { "cache-control": "no-store", ...headers } });
}

export async function POST(request: Request) {
  const limit = await scanRateLimit().check(clientKey(request.headers));
  if (!limit.allowed) {
    return fail(429, "RATE_LIMITED", "Rate limit reached. Retry shortly.", { "retry-after": String(limit.retryAfterSeconds) });
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return fail(413, "BAD_REQUEST", "Request too large.");
    body = JSON.parse(text);
  } catch {
    return fail(400, "BAD_REQUEST", "Send JSON: { \"address\": \"<mint>\", \"chain\": \"auto\" }.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "BAD_REQUEST", "Send JSON: { \"address\": \"<mint>\", \"chain\": \"auto\" }.");

  const { address, chain } = body as { address?: unknown; chain?: unknown };
  const valid = validateScanRequest(address, chain ?? "auto");
  if (!valid.ok) return fail(valid.code === "NETWORK_NOT_SUPPORTED" ? 422 : 400, valid.code, valid.message);

  try {
    const outcome = await scanToken(valid.address);
    if (!outcome.ok) return fail(outcome.status, outcome.code, outcome.message);
    return NextResponse.json(outcome.result, {
      headers: { "cache-control": "no-store", "x-ratelimit-remaining": String(limit.remaining) },
    });
  } catch {
    // Never echo internals: provider URLs can contain keys.
    return fail(500, "INTERNAL", "The scan failed unexpectedly. Retry shortly.");
  }
}

export function GET() {
  return fail(405, "BAD_REQUEST", "Use POST.", { allow: "POST" });
}
