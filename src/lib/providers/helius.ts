/**
 * Helius adapter: the primary deep Solana provider.
 *
 * On whenever HELIUS_API_KEY is set (ENABLE_HELIUS=false turns it off, see
 * config/features.ts). Without a key every function returns
 * `{ available: false, reason: "not_configured" }` without making a request.
 * No function throws: provider failures come back as
 * `{ available: false, reason: "error" }` so a scan degrades to PARTIAL.
 *
 * The key is appended server-side only and never appears in errors, logs,
 * responses or the browser bundle.
 *
 * Endpoints used (verify against https://www.helius.dev/docs before enabling;
 * all paths live in ENDPOINTS below so they can be updated in one place):
 *   RPC (JSON-RPC 2.0)  getAccountInfo, getMultipleAccounts, getTokenSupply,
 *                       getTokenLargestAccounts, getTokenAccountsByOwner,
 *                       getSignaturesForAddress, getTransaction
 *   DAS                 getAsset, getAssetsByAuthority
 *   Enhanced Tx API     GET /v0/addresses/{address}/transactions
 *   Wallet API          GET /v1/wallet/{address}/funded-by
 *                       GET /v1/wallet/{address}/identity
 *
 * Plan fallbacks: the Enhanced Transactions and Wallet APIs are not on every
 * Helius plan. When one of them fails, the adapter falls back to raw RPC:
 *   transactions / history  getSignaturesForAddress + getTransaction (jsonParsed),
 *                           transfers rebuilt from parsed instructions and
 *                           pre/post token balances
 *   original funder         oldest signature of the wallet → the system
 *                           transfer / createAccount that first sent it SOL
 *   identity                no RPC equivalent: reported as unavailable, and
 *                           shared funders are checked for service-like
 *                           activity instead (see getAddressActivity)
 * Whatever still cannot be established is returned as null / unavailable.
 */

import { heliusApiKey, heliusState } from "@/config/features";
import { POOL_INFRASTRUCTURE } from "../analysis/knownAddresses";
import { cached, TTL } from "../cache/scanCache";
import type { IdentityClass } from "../types/scan";
import { fetchJson, mapLimit, num, ProviderError, str } from "./http";

const ENDPOINTS = {
  rpc: (key: string) => `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`,
  enhancedTxs: (key: string, address: string, limit: number) =>
    `https://api.helius.xyz/v0/addresses/${address}/transactions?limit=${limit}&api-key=${encodeURIComponent(key)}`,
  fundedBy: (key: string, address: string) => `https://api.helius.xyz/v1/wallet/${address}/funded-by?api-key=${encodeURIComponent(key)}`,
  identity: (key: string, address: string) => `https://api.helius.xyz/v1/wallet/${address}/identity?api-key=${encodeURIComponent(key)}`,
};

export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEjPxuEb";

/**
 * not_configured  no key / disabled, nothing requested
 * unsupported     the endpoint is not on this Helius plan (and has no RPC fallback)
 * not_found       the provider answered: nothing exists for this input
 * error           the request failed
 */
export type HeliusResult<T> = { available: true; data: T } | { available: false; reason: "not_configured" | "unsupported" | "error" | "not_found" };

/** Thrown for 401/402/403 from a plan-gated endpoint with no RPC fallback. */
class PlanUnsupported extends Error {}

const OFF = { available: false, reason: "not_configured" } as const;
const FAIL = { available: false, reason: "error" } as const;

async function rpc<T>(key: string, method: string, params: unknown, timeoutMs = 8000): Promise<T> {
  const body = await fetchJson<{ result?: T; error?: unknown }>("helius", ENDPOINTS.rpc(key), {
    method: "POST",
    body: { jsonrpc: "2.0", id: method, method, params },
    timeoutMs,
  });
  if (body.error !== undefined || body.result === undefined) throw new Error("helius rpc error");
  return body.result;
}

/** Wraps a call so it never throws and respects the feature flag. */
async function guarded<T>(fn: (key: string) => Promise<T | null>): Promise<HeliusResult<T>> {
  const key = heliusApiKey();
  if (!key) return OFF;
  try {
    const data = await fn(key);
    return data === null ? { available: false, reason: "not_found" } : { available: true, data };
  } catch (err) {
    return err instanceof PlanUnsupported ? { available: false, reason: "unsupported" } : FAIL;
  }
}

/* ------------------------------------------------------------------ */
/* Token configuration                                                 */
/* ------------------------------------------------------------------ */

export interface MintAuthorityInfo {
  program: "SPL" | "TOKEN-2022" | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  supply: number | null;
  decimals: number | null;
  extensions: string[];
  transferHook: boolean;
  transferFee: boolean;
  defaultAccountState: "INITIALIZED" | "FROZEN" | null;
  updateAuthority: string | null;
  metadataMutable: boolean | null;
}

interface ParsedMint {
  owner?: string;
  data?: { parsed?: { type?: string; info?: Record<string, unknown> } };
}

/** getAccountInfo(jsonParsed) on the mint plus DAS getAsset for the metadata update authority. */
export function getAuthorityInformation(mint: string): Promise<HeliusResult<MintAuthorityInfo>> {
  return guarded(async (key) => {
    const res = await cached(`helius:mint:${mint}`, TTL.tokenConfig, async () => {
      const [account, asset] = await Promise.all([
        rpc<{ value: ParsedMint | null }>(key, "getAccountInfo", [mint, { encoding: "jsonParsed" }]),
        rpc<{ authorities?: { address?: string; scopes?: string[] }[]; mutable?: boolean }>(key, "getAsset", { id: mint }).catch(() => null),
      ]);
      const v = account.value;
      if (!v || v.data?.parsed?.type !== "mint") return null;
      const info = v.data.parsed.info ?? {};
      const exts = Array.isArray(info.extensions) ? (info.extensions as { extension?: string; state?: Record<string, unknown> }[]) : [];
      const names = exts.map((e) => str(e.extension)).filter((n): n is string => Boolean(n));
      const das = exts.find((e) => e.extension === "defaultAccountState")?.state?.accountState;
      const updateAuthority = asset?.authorities?.find((a) => a.scopes?.includes("full") || a.scopes?.includes("metadata"))?.address ?? null;
      const decimals = num(info.decimals);
      const rawSupply = num(info.supply);
      return {
        program: v.owner === TOKEN_2022_PROGRAM ? "TOKEN-2022" : v.owner === TOKEN_PROGRAM ? "SPL" : null,
        mintAuthority: str(info.mintAuthority),
        freezeAuthority: str(info.freezeAuthority),
        supply: rawSupply !== null && decimals !== null ? rawSupply / 10 ** decimals : null,
        decimals,
        extensions: names,
        transferHook: names.includes("transferHook"),
        transferFee: names.includes("transferFeeConfig"),
        defaultAccountState: das === "frozen" ? "FROZEN" : das ? "INITIALIZED" : null,
        updateAuthority: str(updateAuthority),
        metadataMutable: typeof asset?.mutable === "boolean" ? asset.mutable : null,
      } satisfies MintAuthorityInfo;
    }, (v) => v !== null);
    return res.value;
  });
}

export function getTokenSupply(mint: string): Promise<HeliusResult<{ supply: number; decimals: number }>> {
  return guarded(async (key) => {
    const r = await rpc<{ value: { uiAmountString?: string; decimals?: number } }>(key, "getTokenSupply", [mint]);
    const supply = num(r.value?.uiAmountString);
    const decimals = num(r.value?.decimals);
    return supply !== null && decimals !== null ? { supply, decimals } : null;
  });
}

/* ------------------------------------------------------------------ */
/* Holders                                                             */
/* ------------------------------------------------------------------ */

export interface LargestAccount {
  tokenAccount: string;
  amount: number;
}

/** Top 20 token accounts by balance. These are accounts, not people. */
export function getLargestTokenAccounts(mint: string): Promise<HeliusResult<LargestAccount[]>> {
  return guarded(async (key) => {
    const res = await cached(`helius:largest:${mint}`, TTL.holders, async () => {
      const r = await rpc<{ value: { address?: string; uiAmountString?: string }[] }>(key, "getTokenLargestAccounts", [mint]);
      return (r.value ?? []).flatMap((a) => {
        const amount = num(a.uiAmountString);
        return a.address && amount !== null ? [{ tokenAccount: a.address, amount }] : [];
      });
    });
    return res.value;
  });
}

export interface AccountOwner {
  tokenAccount: string;
  owner: string | null;
  /** Program that owns the owner account. SYSTEM_PROGRAM means an ordinary wallet. */
  ownerProgram: string | null;
  ownerExecutable: boolean | null;
}

/**
 * Resolves token-account owners, then the owners' own account programs, in
 * two batched getMultipleAccounts calls (100 accounts per call).
 */
export function getTokenAccountOwners(tokenAccounts: string[]): Promise<HeliusResult<AccountOwner[]>> {
  return guarded(async (key) => (await cached(`helius:owners:${tokenAccounts.join(",")}`, TTL.holders, () => resolveOwners(key, tokenAccounts))).value);
}

async function resolveOwners(key: string, tokenAccounts: string[]): Promise<AccountOwner[]> {
  const batch = async (ids: string[]) => {
    const out: ({ owner?: string; executable?: boolean; data?: { parsed?: { info?: { owner?: string } } } } | null)[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const r = await rpc<{ value: typeof out }>(key, "getMultipleAccounts", [ids.slice(i, i + 100), { encoding: "jsonParsed" }]);
      out.push(...(r.value ?? []));
    }
    return out;
  };
  const accounts = await batch(tokenAccounts);
  const owners = accounts.map((a) => str(a?.data?.parsed?.info?.owner));
  const unique = [...new Set(owners.filter((o): o is string => Boolean(o)))];
  const ownerInfos = unique.length ? await batch(unique) : [];
  const byOwner = new Map(unique.map((o, i) => [o, ownerInfos[i]]));
  return tokenAccounts.map((tokenAccount, i) => {
    const owner = owners[i];
    const info = owner ? byOwner.get(owner) : undefined;
    return {
      tokenAccount,
      owner,
      ownerProgram: info ? str(info.owner) : null,
      ownerExecutable: info ? Boolean(info.executable) : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

export interface EnhancedTx {
  signature: string;
  timestamp: number;
  type: string | null;
  feePayer: string | null;
  nativeTransfers: { from: string; to: string; lamports: number }[];
  tokenTransfers: { from: string | null; to: string | null; mint: string; amount: number | null }[];
}

interface RawEnhancedTx {
  signature?: string;
  timestamp?: number;
  type?: string;
  feePayer?: string;
  nativeTransfers?: { fromUserAccount?: string; toUserAccount?: string; amount?: number }[];
  tokenTransfers?: { fromUserAccount?: string; toUserAccount?: string; mint?: string; tokenAmount?: number }[];
}

export function normalizeEnhancedTxs(raw: unknown): EnhancedTx[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawEnhancedTx[]).flatMap((t) => {
    const signature = str(t?.signature);
    const timestamp = num(t?.timestamp);
    if (!signature || timestamp === null) return [];
    return [
      {
        signature,
        timestamp,
        type: str(t.type),
        feePayer: str(t.feePayer),
        nativeTransfers: (t.nativeTransfers ?? []).flatMap((n) =>
          n.fromUserAccount && n.toUserAccount && num(n.amount) !== null ? [{ from: n.fromUserAccount, to: n.toUserAccount, lamports: num(n.amount) as number }] : [],
        ),
        tokenTransfers: (t.tokenTransfers ?? []).flatMap((x) =>
          x.mint ? [{ from: str(x.fromUserAccount), to: str(x.toUserAccount), mint: x.mint, amount: num(x.tokenAmount) }] : [],
        ),
      },
    ];
  });
}

/* Raw-RPC fallback for parsed history ------------------------------------ */

interface RawParsedIx {
  programId?: string;
  program?: string;
  parsed?: { type?: string; info?: Record<string, unknown> };
}
interface RawTokenBalance {
  owner?: string;
  mint?: string;
  uiTokenAmount?: { uiAmountString?: string };
}
export interface RawRpcTx {
  blockTime?: number | null;
  meta?: { err?: unknown; innerInstructions?: { instructions?: RawParsedIx[] }[]; preTokenBalances?: RawTokenBalance[]; postTokenBalances?: RawTokenBalance[] } | null;
  transaction?: { signatures?: string[]; message?: { accountKeys?: ({ pubkey?: string } | string)[]; instructions?: RawParsedIx[] } };
}

const SWAP_PROGRAMS = new Set([...Object.keys(POOL_INFRASTRUCTURE), "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"]);

/**
 * Rebuilds an EnhancedTx from a jsonParsed getTransaction result.
 * SOL transfers come from parsed system instructions (top level and inner);
 * token transfers from the pre/post balance change of each owner. When a mint
 * has exactly one sender or one receiver the pairs are exact; otherwise the
 * unknown side is left null rather than guessed.
 */
export function normalizeRawTx(signature: string, raw: RawRpcTx | null): EnhancedTx | null {
  if (!raw || raw.blockTime == null || raw.meta?.err) return null;
  const msg = raw.transaction?.message;
  const keys = msg?.accountKeys ?? [];
  const first = keys[0];
  const feePayer = typeof first === "string" ? first : str(first?.pubkey);
  const ixs = [...(msg?.instructions ?? []), ...(raw.meta?.innerInstructions ?? []).flatMap((i) => i.instructions ?? [])];

  const nativeTransfers: EnhancedTx["nativeTransfers"] = [];
  let swap = false;
  let nonTransfer = false;
  for (const ix of ixs) {
    if (ix.programId && SWAP_PROGRAMS.has(ix.programId)) swap = true;
    const t = ix.parsed?.type;
    const info = ix.parsed?.info ?? {};
    if (ix.program === "system" && (t === "transfer" || t === "transferWithSeed")) {
      const from = str(info.source);
      const to = str(info.destination);
      const lamports = num(info.lamports);
      if (from && to && lamports !== null) nativeTransfers.push({ from, to, lamports });
    } else if (ix.program === "system" && t === "createAccount") {
      const from = str(info.source);
      const to = str(info.newAccount);
      const lamports = num(info.lamports);
      if (from && to && lamports !== null) nativeTransfers.push({ from, to, lamports });
    } else if (!(ix.program === "spl-token" || ix.program === "spl-associated-token-account" || ix.program === "system" || ix.program === "compute-budget")) {
      nonTransfer = true;
    }
  }

  const delta = new Map<string, Map<string, number>>();
  const apply = (rows: RawTokenBalance[] | undefined, sign: 1 | -1) => {
    for (const b of rows ?? []) {
      const amount = num(b.uiTokenAmount?.uiAmountString);
      if (!b.owner || !b.mint || amount === null) continue;
      const m = delta.get(b.mint) ?? new Map<string, number>();
      m.set(b.owner, (m.get(b.owner) ?? 0) + sign * amount);
      delta.set(b.mint, m);
    }
  };
  apply(raw.meta?.postTokenBalances, 1);
  apply(raw.meta?.preTokenBalances, -1);
  const tokenTransfers: EnhancedTx["tokenTransfers"] = [];
  for (const [mint, owners] of delta) {
    const senders = [...owners].filter(([, v]) => v < 0);
    const receivers = [...owners].filter(([, v]) => v > 0);
    if (senders.length === 1) for (const [to, v] of receivers) tokenTransfers.push({ from: senders[0][0], to, mint, amount: v });
    else if (receivers.length === 1) for (const [from, v] of senders) tokenTransfers.push({ from, to: receivers[0][0], mint, amount: -v });
    else {
      for (const [from, v] of senders) tokenTransfers.push({ from, to: null, mint, amount: -v });
      for (const [to, v] of receivers) tokenTransfers.push({ from: null, to, mint, amount: v });
    }
  }
  const type = swap ? "SWAP" : !nonTransfer && (nativeTransfers.length || tokenTransfers.length) ? "TRANSFER" : null;
  return { signature, timestamp: raw.blockTime, type, feePayer, nativeTransfers, tokenTransfers };
}

/** Pages of history read through raw RPC when the Enhanced API is unavailable. */
const RPC_HISTORY_LIMIT = 25;

async function rpcHistory(key: string, address: string, limit: number): Promise<EnhancedTx[]> {
  const sigs = await rpc<{ signature?: string; err?: unknown }[]>(key, "getSignaturesForAddress", [address, { limit: Math.min(limit, RPC_HISTORY_LIMIT) }]);
  const ok = sigs.filter((s) => s.signature && !s.err).map((s) => s.signature as string);
  const txs = await mapLimit(ok, 5, async (sig) => {
    const raw = await rpc<RawRpcTx | null>(key, "getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]).catch(() => null);
    return normalizeRawTx(sig, raw);
  });
  return txs.filter((t): t is EnhancedTx => t !== null);
}

/** Enhanced Transactions API first; raw RPC when the API is unavailable on this plan. */
async function parsedHistory(key: string, address: string, limit: number): Promise<EnhancedTx[]> {
  try {
    return normalizeEnhancedTxs(await fetchJson<unknown>("helius", ENDPOINTS.enhancedTxs(key, address, limit), { timeoutMs: 9000 }));
  } catch {
    return rpcHistory(key, address, limit);
  }
}

/** Most recent parsed transactions of a wallet (one page, max 100). */
export function getWalletHistory(wallet: string, limit = 100): Promise<HeliusResult<EnhancedTx[]>> {
  return guarded(async (key) => {
    const res = await cached(`helius:history:${wallet}:${limit}`, TTL.graph, () => parsedHistory(key, wallet, limit));
    return res.value;
  });
}

export interface WalletTransfer {
  signature: string;
  timestamp: number;
  /** Transaction type (SWAP, TRANSFER, …) when known. */
  txType: string | null;
  asset: string; // "SOL" or a mint
  from: string;
  to: string;
  amount: number | null;
}

/** Native + token transfers touching the wallet, flattened from its history. */
export async function getWalletTransfers(wallet: string): Promise<HeliusResult<WalletTransfer[]>> {
  const history = await getWalletHistory(wallet);
  if (!history.available) return history;
  const out: WalletTransfer[] = [];
  for (const tx of history.data) {
    for (const n of tx.nativeTransfers) {
      if (n.from === wallet || n.to === wallet) out.push({ signature: tx.signature, timestamp: tx.timestamp, txType: tx.type, asset: "SOL", from: n.from, to: n.to, amount: n.lamports / 1e9 });
    }
    for (const t of tx.tokenTransfers) {
      if (t.from && t.to && (t.from === wallet || t.to === wallet)) out.push({ signature: tx.signature, timestamp: tx.timestamp, txType: tx.type, asset: t.mint, from: t.from, to: t.to, amount: t.amount });
    }
  }
  return { available: true, data: out };
}

/** Recent parsed transactions that involve the mint (one page). */
export function getTokenTransactions(mint: string): Promise<HeliusResult<EnhancedTx[]>> {
  return guarded(async (key) => {
    const res = await cached(`helius:mint-txs:${mint}`, TTL.transactions, () => parsedHistory(key, mint, 100));
    return res.value;
  });
}

/* ------------------------------------------------------------------ */
/* Wallet intelligence                                                 */
/* ------------------------------------------------------------------ */

export interface WalletIdentity {
  name: string | null;
  classification: IdentityClass;
}

/** Maps free-form provider categories onto the fixed identity classes. */
export function classifyIdentity(...labels: (string | null | undefined)[]): IdentityClass {
  const text = labels.filter(Boolean).join(" ").toLowerCase();
  if (!text) return "UNKNOWN";
  if (/(exchange|\bcex\b|binance|coinbase|kraken|okx|bybit|kucoin|gate\.io|mexc|bitget|htx|crypto\.com)/.test(text)) return "CENTRALIZED_EXCHANGE";
  if (/(bridge|wormhole|debridge|allbridge|mayan|portal)/.test(text)) return "BRIDGE";
  if (/(\bdex\b|\bamm\b|pool|router|aggregator|swap|jupiter|raydium|orca|meteora|pump|phoenix|openbook)/.test(text)) return "DEX";
  if (/(treasury|\bdao\b|multisig|foundation)/.test(text)) return "TREASURY";
  if (/(protocol|program|lending|vault|staking|marinade|kamino|solend|marginfi|drift)/.test(text)) return "PROTOCOL";
  return "KNOWN_SERVICE";
}

export function getWalletIdentity(wallet: string): Promise<HeliusResult<WalletIdentity>> {
  return guarded(async (key) => {
    const res = await cached(`helius:identity:${wallet}`, TTL.identity, async () => {
      try {
        const r = await fetchJson<Record<string, unknown>>("helius", ENDPOINTS.identity(key, wallet), { timeoutMs: 6000 });
        const name = str(r.name) ?? str(r.label) ?? str(r.entity);
        const category = str(r.type) ?? str(r.category);
        const tags = Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === "string").join(" ") : null;
        return { name, classification: name || category || tags ? classifyIdentity(category, name, tags) : "UNKNOWN" } satisfies WalletIdentity;
      } catch (err) {
        // 404 = no known identity, which is a valid answer. Any other failure
        // (plan without the Wallet API, outage) leaves identity unavailable.
        if (err instanceof ProviderError && err.status === 404) return { name: null, classification: "UNKNOWN" } satisfies WalletIdentity;
        if (err instanceof ProviderError && (err.status === 401 || err.status === 402 || err.status === 403)) throw new PlanUnsupported();
        throw err;
      }
    });
    return res.value;
  });
}

export interface FunderInfo {
  funder: string;
  funderName: string | null;
  funderClass: IdentityClass;
  timestamp: number | null;
  signature: string | null;
  amountSol: number | null;
}

/** The wallet that first sent this wallet native SOL. */
export function getOriginalFunder(wallet: string): Promise<HeliusResult<FunderInfo>> {
  return guarded(async (key) => {
    const res = await cached(
      `helius:funder:${wallet}`,
      TTL.funder,
      async () => {
        try {
          const r = await fetchJson<Record<string, unknown>>("helius", ENDPOINTS.fundedBy(key, wallet), { timeoutMs: 6000 });
          const d = (r.data && typeof r.data === "object" ? r.data : r) as Record<string, unknown>;
          const funder = str(d.funder) ?? str(d.fundedBy) ?? str(d.source) ?? str(d.address);
          if (!funder) return null;
          const funderName = str(d.funderName) ?? str(d.name) ?? str(d.label);
          const funderType = str(d.funderType) ?? str(d.type) ?? str(d.category);
          const lamports = num(d.amount);
          return {
            funder,
            funderName,
            funderClass: funderName || funderType ? classifyIdentity(funderType, funderName) : "UNKNOWN",
            timestamp: num(d.timestamp) ?? num(d.blockTime),
            signature: str(d.signature),
            amountSol: lamports !== null ? (lamports > 1e6 ? lamports / 1e9 : lamports) : null,
          } satisfies FunderInfo;
        } catch (err) {
          if (err instanceof ProviderError && err.status === 404) return null;
          // Wallet API unavailable on this plan (or failing): trace it from raw RPC.
          return rpcOriginalFunder(key, wallet);
        }
      },
      // "No funder found" is cached too: a wallet's first funding never changes.
    );
    return res.value;
  });
}

/** Signature pages read backwards when tracing a wallet's first funding over RPC. */
const FUNDER_PAGES = 2;

/**
 * Raw-RPC original funder: the wallet's oldest transaction, and in it the
 * system transfer / createAccount that sent this wallet SOL. Wallets with
 * more history than FUNDER_PAGES x 1000 signatures return null (not reached).
 */
async function rpcOriginalFunder(key: string, wallet: string): Promise<FunderInfo | null> {
  let before: string | undefined;
  let oldest: string | undefined;
  for (let page = 0; page < FUNDER_PAGES; page++) {
    const sigs = await rpc<{ signature?: string }[]>(key, "getSignaturesForAddress", [wallet, { limit: 1000, ...(before ? { before } : {}) }]);
    if (!sigs.length) {
      before = undefined;
      break;
    }
    oldest = sigs[sigs.length - 1].signature;
    before = oldest;
    if (sigs.length < 1000) {
      before = undefined;
      break;
    }
  }
  if (!oldest || before) return null; // genesis not reached within the page budget
  const raw = await rpc<RawRpcTx | null>(key, "getTransaction", [oldest, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
  const tx = normalizeRawTx(oldest, raw);
  const funding = tx?.nativeTransfers.find((n) => n.to === wallet && n.from !== wallet);
  if (!tx || !funding) return null;
  return { funder: funding.from, funderName: null, funderClass: "UNKNOWN", timestamp: tx.timestamp, signature: tx.signature, amountSol: funding.lamports / 1e9 };
}

export interface AddressActivity {
  /** Signatures in the most recent page (max 1000). */
  recentSignatures: number;
  /** Seconds between the newest and oldest signature in that page. */
  spanSeconds: number | null;
}

/**
 * Activity of an address from one signature page. Used to spot service-like
 * funders (exchange hot wallets, faucets, distributors) when no identity
 * label is available, so they are not read as a private common funder.
 */
export function getAddressActivity(address: string): Promise<HeliusResult<AddressActivity>> {
  return guarded(async (key) => {
    const res = await cached(`helius:activity:${address}`, TTL.identity, async () => {
      const sigs = await rpc<{ blockTime?: number | null }[]>(key, "getSignaturesForAddress", [address, { limit: 1000 }]);
      const times = sigs.map((s) => s.blockTime).filter((t): t is number => typeof t === "number");
      return { recentSignatures: sigs.length, spanSeconds: times.length >= 2 ? Math.max(...times) - Math.min(...times) : null } satisfies AddressActivity;
    });
    return res.value;
  });
}

/* ------------------------------------------------------------------ */
/* Origin                                                              */
/* ------------------------------------------------------------------ */

export interface OriginInfo {
  /** Fee payer of the oldest transaction that touched the mint. */
  firstSigner: string | null;
  firstSignature: string | null;
  firstTimestamp: number | null;
  /** True when the full signature history was paged and the oldest one is really the first. */
  reachedGenesis: boolean;
}

/**
 * Pages getSignaturesForAddress backwards (max 3 x 1000) to find the mint's
 * first transaction, then reads its fee payer. Long-lived tokens exceed the
 * page budget; then `reachedGenesis` is false and no signer is reported.
 */
export function getOriginAnalysis(mint: string): Promise<HeliusResult<OriginInfo>> {
  return guarded(async (key) => {
    const res = await cached(`helius:origin:${mint}`, TTL.funder, async () => {
      let before: string | undefined;
      let oldest: { signature?: string; blockTime?: number } | undefined;
      let reachedGenesis = false;
      for (let page = 0; page < 3; page++) {
        const sigs = await rpc<{ signature?: string; blockTime?: number }[]>(key, "getSignaturesForAddress", [mint, { limit: 1000, ...(before ? { before } : {}) }]);
        if (!sigs.length) {
          reachedGenesis = Boolean(oldest);
          break;
        }
        oldest = sigs[sigs.length - 1];
        before = oldest.signature;
        if (sigs.length < 1000) {
          reachedGenesis = true;
          break;
        }
      }
      if (!reachedGenesis || !oldest?.signature) return { firstSigner: null, firstSignature: null, firstTimestamp: null, reachedGenesis: false } satisfies OriginInfo;
      const tx = await rpc<{ transaction?: { message?: { accountKeys?: ({ pubkey?: string; signer?: boolean } | string)[] } } } | null>(
        key,
        "getTransaction",
        [oldest.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
      );
      const keys = tx?.transaction?.message?.accountKeys ?? [];
      const first = keys[0];
      const signer = typeof first === "string" ? first : str(first?.pubkey);
      return { firstSigner: signer, firstSignature: oldest.signature, firstTimestamp: num(oldest.blockTime), reachedGenesis: true } satisfies OriginInfo;
    });
    return res.value;
  });
}

/** Other assets where the address is an authority (DAS). Used for "related tokens". */
export function getAssetsByAuthority(authority: string): Promise<HeliusResult<string[]>> {
  return guarded(async (key) => {
    const res = await cached(`helius:by-authority:${authority}`, TTL.graph, async () => {
      const r = await rpc<{ items?: { id?: string; interface?: string }[] }>(key, "getAssetsByAuthority", { authorityAddress: authority, page: 1, limit: 100 });
      return (r.items ?? []).filter((i) => i.interface === "FungibleToken" || i.interface === "FungibleAsset").map((i) => i.id).filter((id): id is string => Boolean(id));
    });
    return res.value;
  });
}

/** Token balance an address holds of a mint (UI amount). */
export function getOwnerTokenBalance(owner: string, mint: string): Promise<HeliusResult<number>> {
  return guarded(async (key) => (await cached(`helius:balance:${owner}:${mint}`, TTL.holders, () => ownerBalance(key, owner, mint))).value);
}

async function ownerBalance(key: string, owner: string, mint: string): Promise<number> {
  const r = await rpc<{ value: { account?: { data?: { parsed?: { info?: { tokenAmount?: { uiAmountString?: string } } } } } }[] }>(
    key,
    "getTokenAccountsByOwner",
    [owner, { mint }, { encoding: "jsonParsed" }],
  );
  return (r.value ?? []).reduce((sum, a) => sum + (num(a.account?.data?.parsed?.info?.tokenAmount?.uiAmountString) ?? 0), 0);
}

/** Batched funder + identity + history lookups for a set of wallets, concurrency-capped. */
export async function getWalletIntel(wallets: string[], concurrency = 5) {
  return mapLimit(wallets, concurrency, async (wallet) => {
    const [funder, identity, transfers] = await Promise.all([getOriginalFunder(wallet), getWalletIdentity(wallet), getWalletTransfers(wallet)]);
    return { wallet, funder, identity, transfers };
  });
}

/** Safe Helius state for /api/health: never the key or URL. */
export function heliusStatus(): "configured" | "not_configured" | "disabled" {
  const state = heliusState();
  return state === "configured" ? "configured" : state === "disabled" ? "disabled" : "not_configured";
}
