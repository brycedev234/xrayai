# ONCHAIN X-RAY

See what the chart doesn't. Paste a Solana token mint and the scanner reads it from public chain data and renders it as a radiograph.

**The token is the patient. Wallets are evidence inside the token.**

The scanner exposes evidence (token configuration, authorities, liquidity, pools, holder concentration, origin activity, token flow, major holders, wallet relationships, common funding and connected holder clusters) and leaves the interpretation to the reader. It never says a token is safe, a scam or a rug.

It is read-only analytics. There is no wallet connection, no private key, no seed phrase, no signing, no transaction execution and no AI model anywhere in the code.

| Organ | Reads | Source |
| --- | --- | --- |
| Genome | Mint / freeze authority, update authority, SPL vs Token-2022, transfer hook, transfer fee, default account state, metadata mutability, supply, decimals, extensions | Helius mint account (wins) + GoPlus |
| Heart | Liquidity, primary pool, pool age, 24h volume, buys / sells, liquidity / market cap, LP burn / lock | DexScreener + GoPlus |
| Brain | Origin address and the evidence for it (DEPLOYER / AUTHORITY / CREATOR), authority links, origin holdings, origin token movements, related tokens | Helius (+ GoPlus authorities) |
| Cells | Holder count, top 1 / 5 / 10 / 20 share, largest meaningful holder, origin share, cluster share | Helius largest accounts with owners resolved (+ GoPlus) |
| Bloodstream | 24h buys / sells / volume, major token movements labelled BUY / SELL / TRANSFER / LIQUIDITY / UNKNOWN | DexScreener + Helius |
| Mass | Connected holder clusters and their relationship signal | Helius wallet graph over the top 20 holders |

## Run locally

```bash
npm install
cp .env.example .env.local     # then paste your Helius key
npm run dev                    # http://localhost:3000
```

Other commands:

```bash
npm run typecheck              # tsc --noEmit
npm test                       # fixture tests (no network, no key)
npm run build                  # production build (works with no environment variables)
npm start                      # serve the production build
npm run preview:build          # single self-contained dist/onchain-xray.html (sample only, no backend)
```

## Environment variables

`.env.example`:

```
HELIUS_API_KEY=
ENABLE_HELIUS=true
```

| Variable | Required | Meaning |
| --- | --- | --- |
| `HELIUS_API_KEY` | for LIVE scans | Server-side Helius key. Without it the app still builds and scans, but results are PARTIAL (Helius NOT CONFIGURED). |
| `ENABLE_HELIUS` | no (default `true`) | `false` turns Helius off even when a key is set. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | no | Shared cache and rate limiting across instances. Without them both run in memory. |

All of these are read on the server only. Never prefix a key with `NEXT_PUBLIC_`, never commit `.env.local` (it is git-ignored), and never put a real key in `.env.example`.

### HELIUS_API_KEY setup

1. Create an account at https://www.helius.dev and copy an API key. The scanner is read-only; the key needs no special permissions.
2. Put it in `.env.local` locally, or in your host's environment settings (Vercel / Netlify: project settings → environment variables).
3. Redeploy, then check `GET /api/health` reports `"helius": "configured"`.

[HELIUS.md](./HELIUS.md) has the verification checklist, the plan fallbacks and the request budget.

## Deploy

Deploy as a normal Next.js app (Vercel, Netlify, any Node host): `npm run build`, then `npm start`. Set `HELIUS_API_KEY` in the host's environment. DexScreener and GoPlus need no credentials. On serverless or multi-instance hosting, also set the Upstash variables so the cache and rate limit are shared.

## Providers

| Provider | File | Key | Responsible for |
| --- | --- | --- | --- |
| Helius | `src/lib/providers/helius.ts` | `HELIUS_API_KEY` | Mint account and authorities, supply, largest token accounts and their owners, token transactions, wallet history and transfers, origin (creation transaction), funders, identities, related tokens |
| DexScreener | `src/lib/providers/dexscreener.ts` | none | Name, symbol, image, price, market cap, FDV, primary pair, pair address and age, liquidity, volume, buys / sells, price change, websites and socials |
| GoPlus Security | `src/lib/providers/goplus.ts` | none | Mint / freeze authority, metadata mutability, Token-2022 indicators, holder count, top holders, LP holders, burn and lock. Only fields present in the response are mapped. |

Provider-specific parsing lives only in these modules. Every call runs on the server behind `/api/scan`, uses a fixed base URL, has an AbortController timeout, and its errors never include the request URL (which may contain the key).

The primary DexScreener pair is chosen deterministically: deepest USD liquidity, then 24h volume, then pair address.

Helius methods used:

| Kind | Methods |
| --- | --- |
| RPC | `getAccountInfo`, `getMultipleAccounts`, `getTokenLargestAccounts`, `getTokenSupply`, `getTokenAccountsByOwner`, `getSignaturesForAddress`, `getTransaction` |
| DAS | `getAsset`, `getAssetsByAuthority` |
| Enhanced Transactions API | `GET /v0/addresses/{address}/transactions` (fallback: RPC) |
| Wallet API | `GET /v1/wallet/{address}/funded-by` (fallback: RPC), `GET /v1/wallet/{address}/identity` (no fallback) |

## API

### `POST /api/scan`

```json
{ "address": "<solana mint>" }
```

The address must decode from base58 to exactly 32 bytes. URLs, free text and EVM addresses are rejected before any provider is called. The body is capped at 2 KB.

Pipeline (`src/lib/analysis/scanToken.ts`):

| Step | Module |
| --- | --- |
| 1 Validate address | `lib/validation/solana.ts` |
| 2 Fetch market data | DexScreener ┐ |
| 3 Fetch token / mint configuration | GoPlus + Helius ├ first wave, concurrent (`Promise.all`) |
|  (also started) | Helius largest accounts, origin trace, mint transactions ┘ |
| 4 Analyze liquidity | `liquidityAnalysis.ts` |
| 5 Analyze holders | `holderAnalysis.ts` |
| 6 Analyze origin / authorities | `originAnalysis.ts` ┐ second wave, concurrent |
| 8 Analyze important holders | funder + identity + history for up to 20 wallets, 5 in flight ┘ |
| 7 Analyze transaction flow | `transactionFlow.ts` |
| 9 Build wallet relationship graph | `walletGraph.ts` |
| 10 Build holder clusters | `clustering.ts` |
| 11 Generate findings | `findings.ts` |
| 12 Generate case file | `statusEngine.ts`, `caseFile.ts` |

Response: a `ScanResult` (`src/lib/types/scan.ts`). Every chain value is nullable; `null` means "not observed" and renders as `—`.

Errors: `{ "error": { "code", "message" } }`

| Code | HTTP | UI |
| --- | --- | --- |
| `INVALID_CONTRACT` | 400 | INVALID CONTRACT |
| `BAD_REQUEST` | 400 / 413 | INVALID REQUEST |
| `NETWORK_NOT_SUPPORTED` | 422 | NETWORK NOT SUPPORTED |
| `TOKEN_NOT_FOUND` | 404 | TOKEN NOT FOUND |
| `RATE_LIMITED` | 429 + `retry-after` | RATE LIMIT REACHED — RETRY SHORTLY |
| `PROVIDER_UNAVAILABLE` | 503 | DATA PROVIDER TEMPORARILY UNAVAILABLE |
| `INTERNAL` | 500 | SCAN FAILED (no stack trace, ever) |

A token with no DEX pair still returns a result with the finding NO LIQUIDITY PAIR FOUND and market values null.

### `GET /api/health`

```json
{ "status": "ok", "providers": { "dexscreener": "available", "goplus": "available", "helius": "configured" } }
```

`status` is `degraded` when any provider is unavailable or Helius is not configured. Never returns keys, URLs or environment values. DexScreener / GoPlus probes are cached for 60 s; Helius is reported from configuration, without spending a request.

## Live, partial and demo

| Mode | When | Shown as |
| --- | --- | --- |
| `live` | DexScreener, GoPlus and Helius all answered | LIVE FEED |
| `partial` | Any provider failed, or Helius is not configured. Whatever is still valid is returned; missing values are null. | PARTIAL FEED, plus the failing source in SOURCES |
| `demo` | Only when the visitor picks **TRY A SAMPLE** or **OPEN RADIOGRAPH** | SIMULATED FEED |

A failed live scan never falls back to example numbers. Demo values live in two files only: `src/data/demoScanResult.ts` (the sample radiograph and the landing case file) and `src/data/mockScan.ts` (the explanatory landing sections). Live code under `src/lib/analysis`, `src/lib/providers` and `src/app/api` never imports them.

## Findings and status

`findings.ts` turns evidence into short factual statements, each with its evidence attached:

```
MINT AUTHORITY ACTIVE
FREEZE AUTHORITY REVOKED
TOP 10 HOLDERS CONTROL 42.1%
LIQUIDITY REPRESENTS 2.8% OF MARKET CAP
8 IMPORTANT HOLDERS SHARE A MEANINGFUL FUNDING SOURCE
COMMON FUNDER IS A KNOWN EXCHANGE · 5 HOLDERS · COMMON WITHDRAWAL SOURCE
ORIGIN WALLET HOLDS 4.2%
2 CONNECTED HOLDER CLUSTERS DETECTED
```

`statusEngine.ts` derives the case-file status only from findings, in this priority: ANOMALOUS STRUCTURE DETECTED, RELATIONSHIP SIGNALS DETECTED, PRIVILEGED AUTHORITY ACTIVE, HIGH HOLDER CONCENTRATION, LOW LIQUIDITY, INSUFFICIENT DATA, PARTIAL SCAN, NO MAJOR STRUCTURAL FLAGS DETECTED. Every threshold is in `src/config/thresholds.ts`.

Every scan also gets a **verdict**, the quick answer to "is this token good or not?", counted in red flags (`evaluateVerdict` in `statusEngine.ts`):

| Verdict | When |
| --- | --- |
| SERIOUS RED FLAGS | anomalous linked-wallet structure, an active mint / freeze authority, transfer hook or frozen-by-default accounts, or three or more flagged areas |
| SOME RED FLAGS | connected holders, high holder concentration or low liquidity |
| FEW RED FLAGS FOUND | a complete (LIVE) scan with none of the above |
| NOT ENOUGH DATA FOR A VERDICT | a partial or thin scan with nothing flagged |

It never says SAFE. On-chain data can show red flags; it cannot prove their absence (a clean-looking token can still be sold down by a new wallet tomorrow), so every verdict carries that limit in its summary.

The case id (`0XR-#####`) is a hash of `solana:<mint>`, so the same mint always gets the same id.

## How MASS works

1. **Pick the wallets.** The top 20 holders by balance, after resolving token accounts to owners and removing pools, burn addresses, program-owned accounts and wallets Helius identifies as exchanges or infrastructure. It never recurses into hundreds of wallets.
2. **Trace each wallet.** Original SOL funder, identity, and recent history (transfers, first acquisition of the token).
3. **Build edges, each with its evidence:**
   - `COMMON_FUNDER`: wallets share an original funder that is not an exchange, DEX, protocol, bridge, treasury or known service. Unlabeled funders shared by several wallets are checked first: a service-like address (1,000 signatures within 7 days) is treated as infrastructure.
   - `COMMON_WITHDRAWAL_SOURCE`: the shared funder is an exchange or infrastructure. Shown, never links wallets.
   - `DIRECT_TRANSFER`: the wallets sent tokens or SOL to each other (signature, timestamp, asset, amount, source, destination).
   - `ORIGIN_PROXIMITY`: the wallet is 1 or 2 hops from the origin (direct transfer, or funded by the origin or by a wallet the origin funded).
   - `REPEATED_INTERACTION`: two or more separate transfers between the same pair.
   - `SHARED_COUNTERPARTY`: the wallets transacted with the same uncommon address.
   - `SYNCHRONIZED_ENTRY`: first acquisitions within 45 s (configurable).
4. **Cluster.** Connected components over the strong edge types only (common funder, direct transfer, origin proximity, repeated interaction). Holding the same token, or buying at the same time, never creates a MASS on its own.

Each cluster carries its wallets, combined supply share, relationship types, common funders, withdrawal sources, direct transfers, synchronized entries, origin links, known entity classifications and its relationship signal with the breakdown behind it.

## What the Relationship Signal means

A deterministic 0-100 summary of how many observable relationship indicators connect a cluster's wallets. It is **not** a probability that the wallets share an owner, and **not** a scam or rug score.

```
coverage_k = wallets touched by an edge of type k / wallets in the cluster
signal     = 100 × (1 − Π_k (1 − weight_k × coverage_k)), capped at 100
```

| Type | Weight | Strength |
| --- | --- | --- |
| COMMON_FUNDER | 0.55 | strong |
| DIRECT_TRANSFER | 0.50 | strong |
| ORIGIN_PROXIMITY | 0.50 | strong |
| REPEATED_INTERACTION | 0.30 | medium |
| SHARED_COUNTERPARTY | 0.25 | medium |
| SYNCHRONIZED_ENTRY | 0.20 | weak |
| COMMON_WITHDRAWAL_SOURCE | 0 | informational |

Each cluster stores `signalBreakdown` (type, weight, coverage, points), so the reason for every number is in the result. The overall signal is the highest cluster signal, and it is `null` when too few wallets could be traced (INSUFFICIENT GRAPH DATA).

## Caching and rate limiting

- `src/lib/cache/scanCache.ts`: TTL cache with in-flight de-duplication behind a `CacheStore` interface. With the Upstash variables set it is shared through Upstash Redis; otherwise in memory. Failures are never cached. TTLs: market 20 s, security 2 min, token config 10 min, holders 60 s, transactions 45 s, wallet graph 3 min, funders and identities 24 h, health 60 s. Scanning the same token again inside those windows makes no provider requests.
- `src/lib/rateLimit/scanRateLimit.ts`: 10 scans per minute per IP behind a `RateLimiter` interface. Upstash fixed window when configured, in-memory sliding window otherwise or if Upstash is unreachable. Over the limit returns 429 with `retry-after`.

## Security and privacy

- Read-only: no wallet connection, no private keys, no seed phrases, no treasury wallet, no signing, no transaction execution.
- Keys are server-only. Nothing is prefixed `NEXT_PUBLIC_`; the browser talks only to `/api/scan` and `/api/health`.
- Input is validated before any provider call; the API never fetches a user-supplied URL.
- Provider responses are parsed field by field into typed values; unknown fields are dropped and links are limited to `http(s)`.
- Errors are short codes and messages, never stack traces or request URLs. Nothing is logged, so keys and client IPs are not written anywhere (the IP is only a rate-limit key).

## Socials

The site shows one channel: X / Twitter at https://x.com/xraydotio, set in `src/config/socials.ts`. A blank value hides it; only `http(s)` URLs render; links open with `target="_blank" rel="noopener noreferrer"`.

## The page

| Nav | Section | Component |
| --- | --- | --- |
| | Hero | `landing/Landing.tsx` |
| SOCIALS | Signal / live | `site/SocialsSection.tsx` |
| GENOME | Token genome / 01 | `site/GenomeSection.tsx` |
| ANATOMY | Radiography / 02 | `site/AnatomySection.tsx` |
| MASS | Cluster analysis / 03 | `site/MassDetection.tsx` |
| FLOW | Flow analysis / 04 | `site/TransactionFlow.tsx` |
| CASE FILE | Scan output / 05 | `site/CaseFile.tsx` |
| HOW IT WORKS | Procedure / 06 (how it works: ingest, reconstruct, diagnose) | `site/HowItWorks.tsx` |
| | Philosophy | `site/PhilosophySection.tsx` |
| SCAN → | Final scan | `site/FinalScanCTA.tsx` |
| | Footer | `site/Footer.tsx` |

The findings in the How it works section are a labelled design example; they are never mixed into a real scan.

The radiograph (`xray/RadiographView.tsx`) renders a live result through `xray/project.ts`, which maps only returned data onto the visual. The organ panel (`xray/OrganPanel.tsx`) lists each organ's values and findings, coverage, and the live state of every source.

## Tests

`npm test` runs fixture tests: shapes modelled on DexScreener, GoPlus and Helius responses, served by a mocked `fetch`. They cover malformed and valid addresses, an active trading token, low liquidity, a token with no DEX pair, Helius failure, GoPlus failure, partial scans, Helius enabled, a missing Helius key, the Helius plan fallbacks, demo mode, caching on a repeat scan, the rate limiter, `/api/health`, case-file generation, holder concentration, MASS with and without clusters, an exchange common funder and a direct wallet relationship. They do not call the live APIs.
