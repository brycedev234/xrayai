# Helius setup

Helius is the primary deep provider: the on-chain mint account, owner-resolved holders, origin tracing, transaction flow, wallet funders and identities, and the MASS relationship graph. It is on by default (`ENABLE_HELIUS=true`) and only needs a key.

Without a key the app still builds and scans: DexScreener and GoPlus answer, Helius shows as NOT CONFIGURED, and results are PARTIAL.

## 1. Get a key

Create an account at https://www.helius.dev and copy an API key from the dashboard. The scanner is read-only; the key needs no special permissions.

## 2. Add the environment variables

Server-side only. Do **not** use a `NEXT_PUBLIC_` prefix, and never commit the key.

```
HELIUS_API_KEY=your-key
ENABLE_HELIUS=true
```

Locally: put them in `.env.local`. On Vercel / Netlify: project settings → environment variables.

## 3. Redeploy

Environment changes take effect on the next deploy (or `npm run build && npm start` locally).

## 4. Check health

```
curl https://your-app/api/health
→ { "status": "ok", "providers": { "dexscreener": "available", "goplus": "available", "helius": "configured" } }
```

## 5. Test a real token

Scan an active Solana memecoin and confirm in the radiograph panel:

- [ ] The feed pill reads **LIVE FEED** and the panel header says LIVE.
- [ ] **GENOME** shows TOKEN PROGRAM (SPL / TOKEN-2022), DECIMALS and EXTENSIONS instead of HELIUS NOT CONFIGURED. Source reads GOPLUS + HELIUS.
- [ ] **CELLS** basis reads `TOP 20 · POOLS EXCLUDED` (holder tracing from largest accounts with owners resolved).
- [ ] **BRAIN** shows an origin labelled DEPLOYER with evidence `FIRST TX SIGNER · VERIFIED` (origin tracing), plus origin balance and related tokens.
- [ ] **BLOODSTREAM** shows a number for MAJOR MOVEMENTS, each labelled BUY / SELL / TRANSFER / LIQUIDITY / UNKNOWN.
- [ ] **MASS** mode reads **HELIUS ENHANCED**, WALLETS TRACED is a number, and the readout shows a cluster, NO MATERIAL CLUSTERS DETECTED, or INSUFFICIENT GRAPH DATA.
- [ ] Funded-by is enabled: hover a linked wallet and the Funder row is filled.
- [ ] Identity is enabled: exchange and protocol wallets do not appear in clusters, and exchange funders show up only as COMMON WITHDRAWAL SOURCE.
- [ ] The SOURCES list shows HELIUS rows as LIVE and the footer no longer says HELIUS NOT CONFIGURED.

If a Helius call fails the scan still completes as **PARTIAL FEED**, and the panel's SOURCES list names the failing lookup.

## 5a. Plan fallbacks

The Enhanced Transactions API and the Wallet API are not on every Helius plan. When they fail the adapter falls back automatically:

| Feature | Preferred | Fallback |
| --- | --- | --- |
| Wallet / token history | Enhanced Transactions API | `getSignaturesForAddress` + `getTransaction` (jsonParsed), last 25 transactions, transfers rebuilt from parsed instructions and token-balance changes |
| Original funder | Wallet API `funded-by` | the wallet's oldest transaction (up to 2,000 signatures back) and the SOL transfer / createAccount that funded it |
| Wallet identity | Wallet API `identity` | none; reported as "identity not on this Helius plan". Shared funders are then checked for service-like activity (1,000 signatures within 7 days) so exchanges are not read as private funders |

A plan limitation is not a failure: the scan stays LIVE and coverage shows IDENTITY as not observed.

Placeholder labels from the Wallet API ("unknown", "wallet", "user", empty strings) and bare on-chain domains such as `name.sol` are not identities: those holders stay UNKNOWN and are traced in the wallet graph. Only a real label (an exchange, DEX, protocol, named service) changes how a holder or funder is read.

## 5b. Verify the endpoint paths

The RPC methods (`getAccountInfo`, `getMultipleAccounts`, `getTokenSupply`, `getTokenLargestAccounts`, `getTokenAccountsByOwner`, `getSignaturesForAddress`, `getTransaction`) and DAS methods (`getAsset`, `getAssetsByAuthority`) are standard. The Enhanced Transactions API (`/v0/addresses/{address}/transactions`) and the Wallet API (`/v1/wallet/{address}/funded-by`, `/v1/wallet/{address}/identity`) are Helius-specific and their paths and response fields should be checked against the current Helius docs before going live. All URLs are in the `ENDPOINTS` object at the top of `helius.ts`, and the response parsers accept the common field-name variants.

These calls were written against fixtures (`tests/helius.test.ts`); they have not been run against the live Helius API.

## Cost and load

Per uncached scan the Helius path makes roughly 70-80 requests: about 10 RPC / DAS calls for the token and origin, then three lookups (history, funder, identity) for each of up to 20 holders, at most 5 in flight. Funders and identities are cached for 24 hours, wallet histories for 3 minutes, so repeat scans of the same token are much cheaper. Lower `GRAPH_WALLET_LIMIT` in `src/lib/analysis/scanToken.ts` to reduce load.

## Turning it off

Set `ENABLE_HELIUS=false` (or remove the key) and redeploy. Every Helius function then returns `{ available: false }` without making a request, and scans are PARTIAL with HELIUS NOT CONFIGURED.
