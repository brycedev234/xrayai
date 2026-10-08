/**
 * GENOME: token configuration.
 *
 * Base mode reads GoPlus. When Helius is enabled the mint account itself is
 * read (getAccountInfo jsonParsed) and those on-chain values take precedence.
 * Anything neither source reports stays null.
 */

import type { MintAuthorityInfo } from "../providers/helius";
import type { SecurityData } from "../providers/goplus";
import type { FlagState, Genome, ProviderId } from "../types/scan";

export function buildGenome(security: SecurityData | null, mint: MintAuthorityInfo | null): Genome {
  const verifiedBy: ProviderId[] = [];
  if (security) verifiedBy.push("goplus");
  if (mint) verifiedBy.push("helius");

  const token2022 = mint ? mint.program === "TOKEN-2022" : security && security.token2022Signals.length > 0 ? true : null;

  return {
    mintAuthority: mint ? mint.mintAuthority : (security?.mintAuthority ?? null),
    mintAuthorityActive: mint ? mint.mintAuthority !== null : (security?.mintAuthorityActive ?? null),
    freezeAuthority: mint ? mint.freezeAuthority : (security?.freezeAuthority ?? null),
    freezeAuthorityActive: mint ? mint.freezeAuthority !== null : (security?.freezeAuthorityActive ?? null),
    updateAuthority: mint?.updateAuthority ?? security?.updateAuthority ?? null,
    metadataMutable: mint?.metadataMutable ?? security?.metadataMutable ?? null,
    tokenProgram: mint ? mint.program : token2022 ? "TOKEN-2022" : null,
    token2022,
    transferHook: mint ? mint.transferHook : (security?.transferHook ?? null),
    transferFee: mint ? mint.transferFee : (security?.transferFee ?? null),
    defaultAccountState: mint?.defaultAccountState ?? security?.defaultAccountState ?? null,
    supply: mint?.supply ?? security?.totalSupply ?? null,
    decimals: mint?.decimals ?? null,
    extensions: mint ? mint.extensions : token2022 && security ? security.token2022Signals : null,
    verifiedBy,
  };
}

/** Display state for a boolean authority-style field. */
export function authorityState(active: boolean | null, heliusEnabled: boolean): FlagState {
  if (active === true) return "ACTIVE";
  if (active === false) return "REVOKED";
  return heliusEnabled ? "UNKNOWN" : "INSUFFICIENT_DATA";
}
