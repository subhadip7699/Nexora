/**
 * On-chain verification links for Midnight Preprod.
 */

export type ExplorerNetwork = "preprod" | "undeployed";

const PREPROD_EXPLORER_BASE = "https://preprod.midnightexplorer.com";

export function explorerBaseUrl(network: ExplorerNetwork = "preprod"): string | null {
  if (network === "undeployed") return null;
  return PREPROD_EXPLORER_BASE;
}

/** Normalize hex for explorer paths (prefer 0x prefix). */
export function toExplorerHex(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

/**
 * Transaction detail page.
 * Example: https://preprod.midnightexplorer.com/transactions/0xd5823d...
 */
export function explorerTransactionUrl(
  txId: string | null | undefined,
  network: ExplorerNetwork = "preprod",
): string | null {
  if (!txId) return null;
  const base = explorerBaseUrl(network);
  if (!base) return null;
  return `${base}/transactions/${toExplorerHex(txId)}`;
}

/**
 * Contract detail page.
 * Example: https://preprod.midnightexplorer.com/contracts/05668a...
 */
export function explorerContractUrl(
  contractId: string | null | undefined,
  network: ExplorerNetwork = "preprod",
): string | null {
  if (!contractId) return null;
  const base = explorerBaseUrl(network);
  if (!base) return null;
  // Midnight Explorer contract pages expect the hash WITHOUT the 0x prefix.
  const hashWithout0x = contractId.trim().replace(/^0x/i, "");
  return `${base}/contracts/${hashWithout0x}`;
}

export function explorerHomeUrl(network: ExplorerNetwork = "preprod"): string | null {
  return explorerBaseUrl(network);
}
