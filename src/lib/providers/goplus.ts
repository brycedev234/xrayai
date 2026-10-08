/**
 * GoPlus Security: public Solana Token Security endpoint, no key.
 * Docs: https://docs.gopluslabs.io/reference/solanatokensecurityusingget
 *
 * GET /api/v1/solana/token_security?contract_addresses={mint}
 *
 * GoPlus returns most numbers as strings and flags as "0"/"1" status objects.
 * Everything is normalized defensively: a field that is missing or malformed
 * becomes null, never a guessed value.
 */

import { cached, TTL } from "../cache/scanCache";
import type { ProviderResult } from "./dexscreener";
import { describeFailure, fetchJson, num, str } from "./http";

const BASE = "https://api.gopluslabs.io/api/v1/solana/token_security";

interface StatusObj {
  status?: string | number;
  authority?: { address?: string }[];
  metadata_upgrade_authority?: { address?: string }[];
}

interface RawHolder {
  account?: string;
  token_account?: string;
  balance?: string | number;
  percent?: string | number;
  is_locked?: number | string;
  tag?: string;
}

export interface RawGoPlusToken {
  mintable?: StatusObj;
  freezable?: StatusObj;
  closable?: StatusObj;
  metadata_mutable?: StatusObj;
  balance_mutable_authority?: StatusObj;
  transfer_hook?: unknown[];
  transfer_fee?: Record<string, unknown>;
  default_account_state?: string | number;
  non_transferable?: string | number;
  holders?: RawHolder[];
  lp_holders?: RawHolder[];
  holder_count?: string | number;
  total_supply?: string | number;
  creators?: { address?: string }[];
  metadata?: { name?: string; symbol?: string; uri?: string };
  dex?: { dex_name?: string; id?: string; tvl?: string | number; burn_percent?: string | number }[];
  trusted_token?: number | string;
}

export interface SecurityHolder {
  owner: string | null;
  tokenAccount: string | null;
  amount: number | null;
  /** 0-100. */
  percent: number | null;
  locked: boolean | null;
  tag: string | null;
}

export interface SecurityData {
  name: string | null;
  symbol: string | null;
  mintAuthorityActive: boolean | null;
  mintAuthority: string | null;
  freezeAuthorityActive: boolean | null;
  freezeAuthority: string | null;
  metadataMutable: boolean | null;
  updateAuthority: string | null;
  transferHook: boolean | null;
  transferFee: boolean | null;
  defaultAccountState: "INITIALIZED" | "FROZEN" | null;
  nonTransferable: boolean | null;
  /** True when GoPlus reports any Token-2022-only feature. Absence proves nothing. */
  token2022Signals: string[];
  totalSupply: number | null;
  holderCount: number | null;
  holders: SecurityHolder[];
  lpHolders: SecurityHolder[];
  creators: string[];
  /** Highest LP burn percentage GoPlus reports across pools (0-100). */
  lpBurnPercent: number | null;
}

const flag = (o: StatusObj | undefined): boolean | null => {
  if (!o || o.status === undefined || o.status === null || o.status === "") return null;
  return String(o.status) === "1";
};

const firstAuthority = (list: { address?: string }[] | undefined): string | null =>
  (Array.isArray(list) ? list.map((a) => str(a?.address)).find(Boolean) : null) ?? null;

/**
 * GoPlus documents holder `percent` as a share of supply. The scale (0-1 vs
 * 0-100) is not guaranteed across chains, so it is detected from the data:
 * when every value is <= 1 and they sum to <= 1.0001 the list is fractional.
 */
function normalizeHolders(list: RawHolder[] | undefined, totalSupply: number | null): SecurityHolder[] {
  if (!Array.isArray(list)) return [];
  const raw = list.map((h) => num(h.percent));
  const present = raw.filter((v): v is number => v !== null);
  const fractional = present.length > 0 && present.every((v) => v <= 1) && present.reduce((a, b) => a + b, 0) <= 1.0001;
  return list.map((h, i) => {
    const amount = num(h.balance);
    let percent = raw[i] !== null ? (fractional ? (raw[i] as number) * 100 : (raw[i] as number)) : null;
    if (percent === null && amount !== null && totalSupply) percent = (amount / totalSupply) * 100;
    const locked = h.is_locked === undefined || h.is_locked === null ? null : String(h.is_locked) === "1";
    return {
      owner: str(h.account),
      tokenAccount: str(h.token_account),
      amount,
      percent: percent !== null && percent >= 0 && percent <= 100 ? percent : null,
      locked,
      tag: str(h.tag),
    };
  });
}

/** Pure normalizer, exported for fixture tests. */
export function normalizeGoPlus(address: string, body: unknown): SecurityData | null {
  const b = body as { code?: number; result?: Record<string, RawGoPlusToken> } | null;
  if (!b || typeof b !== "object" || !b.result || typeof b.result !== "object") return null;
  const entry = b.result[address] ?? b.result[address.toLowerCase()] ?? Object.values(b.result)[0];
  if (!entry || typeof entry !== "object" || Object.keys(entry).length === 0) return null;

  const totalSupply = num(entry.total_supply);
  const hookList = Array.isArray(entry.transfer_hook) ? entry.transfer_hook : null;
  const feeObj = entry.transfer_fee && typeof entry.transfer_fee === "object" ? entry.transfer_fee : null;
  const transferFee = feeObj ? Object.keys(feeObj).length > 0 : null;
  const das = entry.default_account_state;
  const defaultAccountState = das === undefined || das === null || das === "" ? null : String(das) === "2" ? "FROZEN" : "INITIALIZED";

  const token2022Signals: string[] = [];
  if (hookList && hookList.length) token2022Signals.push("TRANSFER HOOK");
  if (transferFee) token2022Signals.push("TRANSFER FEE");
  if (defaultAccountState === "FROZEN") token2022Signals.push("DEFAULT ACCOUNT STATE");
  if (String(entry.non_transferable) === "1") token2022Signals.push("NON-TRANSFERABLE");
  if (flag(entry.balance_mutable_authority)) token2022Signals.push("PERMANENT DELEGATE");

  const burns = (entry.dex ?? []).map((d) => num(d.burn_percent)).filter((v): v is number => v !== null);

  return {
    name: str(entry.metadata?.name),
    symbol: str(entry.metadata?.symbol),
    mintAuthorityActive: flag(entry.mintable),
    mintAuthority: firstAuthority(entry.mintable?.authority),
    freezeAuthorityActive: flag(entry.freezable),
    freezeAuthority: firstAuthority(entry.freezable?.authority),
    metadataMutable: flag(entry.metadata_mutable),
    updateAuthority: firstAuthority(entry.metadata_mutable?.metadata_upgrade_authority),
    transferHook: hookList ? hookList.length > 0 : null,
    transferFee,
    defaultAccountState,
    nonTransferable: entry.non_transferable === undefined ? null : String(entry.non_transferable) === "1",
    token2022Signals,
    totalSupply,
    holderCount: num(entry.holder_count),
    holders: normalizeHolders(entry.holders, totalSupply),
    lpHolders: normalizeHolders(entry.lp_holders, null),
    creators: (entry.creators ?? []).map((c) => str(c?.address)).filter((a): a is string => Boolean(a)),
    lpBurnPercent: burns.length ? Math.max(...burns.map((v) => (v <= 1 ? v * 100 : v))) : null,
  };
}

export async function fetchSecurity(address: string, signal?: AbortSignal): Promise<ProviderResult<SecurityData>> {
  try {
    const res = await cached(
      `goplus:${address}`,
      TTL.security,
      async () => normalizeGoPlus(address, await fetchJson<unknown>("goplus", `${BASE}?contract_addresses=${address}`, { timeoutMs: 8000, signal })),
      (v) => v !== null,
    );
    return {
      data: res.value,
      source: { provider: "goplus", scope: "security", status: res.value ? "ok" : "empty", fetchedAt: res.fetchedAt, cached: res.cached, note: res.value ? undefined : "no security record" },
    };
  } catch (err) {
    return { data: null, source: { provider: "goplus", scope: "security", status: "error", fetchedAt: null, cached: false, note: describeFailure(err) } };
  }
}

export async function probeGoPlus(): Promise<boolean> {
  try {
    await fetchJson("goplus", `${BASE}?contract_addresses=So11111111111111111111111111111111111111112`, { timeoutMs: 4000 });
    return true;
  } catch {
    return false;
  }
}
