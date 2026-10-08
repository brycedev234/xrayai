/**
 * Etherscan (EVM) adapter: placeholder.
 *
 * EVM scanning is not enabled yet. The API validates EVM addresses and
 * answers NETWORK_NOT_SUPPORTED, so nothing here is called. When EVM support
 * lands, implement these against Etherscan API V2
 * (https://api.etherscan.io/v2/api?chainid=...) with ETHERSCAN_API_KEY read
 * server-side only, following the same `{ available: false }` contract as
 * helius.ts.
 */

export type EtherscanResult<T> = { available: true; data: T } | { available: false; reason: "not_configured" };

export async function getContractCreation(_address: string, _chainId: number): Promise<EtherscanResult<{ creator: string; txHash: string }>> {
  return { available: false, reason: "not_configured" };
}
