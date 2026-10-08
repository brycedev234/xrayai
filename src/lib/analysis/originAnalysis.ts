/**
 * BRAIN: creator / origin.
 *
 * The origin is chosen from the strongest available evidence, in order:
 *   1. FIRST_TRANSACTION_SIGNER  fee payer of the mint's first transaction (Helius, verified)  → DEPLOYER
 *   2. MINT_AUTHORITY            an active mint authority (verified with Helius, reported by GoPlus) → AUTHORITY
 *   3. UPDATE_AUTHORITY          metadata update authority, unless it is a launchpad-wide authority → AUTHORITY
 *   4. METADATA_CREATOR          first metadata creator reported by GoPlus → CREATOR
 * Launchpad / shared authorities are never treated as an origin. Nothing is
 * called a "dev". Prior deployments and related tokens are reported only
 * when the authority lookup actually returns them.
 */

import type { SecurityData } from "../providers/goplus";
import type { MintAuthorityInfo, OriginInfo } from "../providers/helius";
import type { Brain, Movement } from "../types/scan";
import { POOL_INFRASTRUCTURE, SHARED_AUTHORITIES } from "./knownAddresses";

const usable = (a: string | null | undefined): a is string => Boolean(a && !SHARED_AUTHORITIES[a] && !POOL_INFRASTRUCTURE[a]);

type Picked = Pick<Brain, "originAddress" | "originEvidence" | "originConfidence" | "originLabel">;

export function pickOrigin(security: SecurityData | null, mint: MintAuthorityInfo | null, origin: OriginInfo | null): Picked {
  if (origin?.reachedGenesis && usable(origin.firstSigner)) {
    return { originAddress: origin.firstSigner, originEvidence: "FIRST_TRANSACTION_SIGNER", originConfidence: "verified", originLabel: "DEPLOYER" };
  }
  const mintAuth = mint ? mint.mintAuthority : security?.mintAuthorityActive ? security.mintAuthority : null;
  if (usable(mintAuth)) return { originAddress: mintAuth, originEvidence: "MINT_AUTHORITY", originConfidence: mint ? "verified" : "reported", originLabel: "AUTHORITY" };
  const update = mint?.updateAuthority ?? security?.updateAuthority ?? null;
  if (usable(update)) return { originAddress: update, originEvidence: "UPDATE_AUTHORITY", originConfidence: mint ? "verified" : "reported", originLabel: "AUTHORITY" };
  const creator = security?.creators.find(usable);
  if (creator) return { originAddress: creator, originEvidence: "METADATA_CREATOR", originConfidence: "reported", originLabel: "CREATOR" };
  return { originAddress: null, originEvidence: null, originConfidence: null, originLabel: null };
}

export interface BrainInputs {
  security: SecurityData | null;
  mint: MintAuthorityInfo | null;
  origin: OriginInfo | null;
  supply: number | null;
  /** Share from the holder set, when the origin appears in it. */
  holderSetSharePercent: number | null;
  helius: { balance: number | null; relatedTokens: string[] | null; movements: Movement[] | null } | null;
}

export function buildBrain(i: BrainInputs): Brain {
  const picked = pickOrigin(i.security, i.mint, i.origin);
  const balance = i.helius?.balance ?? null;
  const share = balance !== null && i.supply ? (balance / i.supply) * 100 : i.holderSetSharePercent;
  const mintAuthority = i.mint ? i.mint.mintAuthority : (i.security?.mintAuthority ?? null);
  const freezeAuthority = i.mint ? i.mint.freezeAuthority : (i.security?.freezeAuthority ?? null);
  const updateAuthority = i.mint?.updateAuthority ?? i.security?.updateAuthority ?? null;

  const o = picked.originAddress;
  const authorityLinks = o
    ? [
        mintAuthority === o ? "ORIGIN IS MINT AUTHORITY" : null,
        freezeAuthority === o ? "ORIGIN IS FREEZE AUTHORITY" : null,
        updateAuthority === o ? "ORIGIN IS UPDATE AUTHORITY" : null,
      ].filter((v): v is string => v !== null)
    : [];
  if (updateAuthority && SHARED_AUTHORITIES[updateAuthority]) authorityLinks.push(`UPDATE AUTHORITY IS ${SHARED_AUTHORITIES[updateAuthority].toUpperCase()}`);

  const movements = i.helius?.movements ?? null;
  return {
    ...picked,
    mintAuthority,
    freezeAuthority,
    updateAuthority,
    originTokenBalance: balance,
    originSupplyPercent: share,
    originMovements: movements && o ? movements.filter((m) => m.from === o).length : null,
    priorDeployments: i.helius?.relatedTokens ? i.helius.relatedTokens.length : null,
    relatedTokens: i.helius?.relatedTokens ?? null,
    authorityLinks,
    recentTokenMovements: movements ? [...movements].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10) : [],
  };
}
