import type { MidnightProviders } from "@midnight-ntwrk/midnight-js-types";
import "@midnight-ntwrk/dapp-connector-api";
import type { InitialAPI } from "@midnight-ntwrk/dapp-connector-api";

export type NetworkId = "preprod" | "undeployed";

export type WalletAddresses = {
  shieldedCoinPublicKey?: unknown;
  shieldedEncryptionPublicKey?: unknown;
  coinPublicKey?: unknown;
  encryptionPublicKey?: unknown;
  shieldedAddress?: string;
  unshieldedAddress?: string;
};

type WalletApi = {
  getConfiguration?: () => Promise<Record<string, unknown>>;
  getShieldedAddresses?: () => Promise<WalletAddresses>;
  getUnshieldedAddress?: () => Promise<{ unshieldedAddress?: string }>;
  getProvingProvider?: (provider: unknown) => Promise<unknown>;
  balanceUnsealedTransaction?: (tx: string, options?: { payFees?: boolean }) => Promise<{ tx?: string }>;
  submitTransaction?: (tx: string) => Promise<unknown>;
  getTxHistory?: (pageNumber: number, pageSize: number) => Promise<Array<{ txHash?: string; txStatus?: unknown }>>;
  getConnectionStatus?: () => Promise<{ status: string }>;
  hintUsage?: (methodNames: string[]) => Promise<void>;
  getDustBalance?: () => Promise<{ balance: bigint | number | string; cap: bigint | number | string }>;
  disconnect?: () => Promise<void> | void;
  enable?: () => Promise<void> | void;
};

export type WalletOption = Pick<InitialAPI, "connect" | "name" | "rdns" | "apiVersion" | "icon"> & {
  injectionKey: string;
};

type SerializedTransaction = { serialize: () => Uint8Array };

export type TransactionProgressStage = "preparing" | "proving" | "balancing" | "awaiting_wallet" | "submitted";

export type SessionInfo = {
  networkId: NetworkId;
  indexerUrl: string;
  indexerWsUrl: string;
  proofServerUrl: string;
  nodeUrl: string;
  unshieldedAddress: string | null;
};

export type WalletKind = "lace" | "1am";

export type WalletActionResult = {
  success: boolean;
  confirmed: boolean;
  txHash?: string;
  wallet: WalletKind;
  status?: string;
  rawResult?: unknown;
};

export type AccessVerificationResult = WalletActionResult;

export type CredentialEnrollmentResult = WalletActionResult & {
  txId: string | null;
  credentialHash: Uint8Array;
  alreadyEnrolled: boolean;
};

type WalletSubmitResult = {
  submitted: boolean;
  confirmed: boolean;
  txHash: string | null;
  wallet: WalletKind;
  status: string;
  rawResult?: unknown;
};

export const APP_NETWORK: Exclude<NetworkId, "undeployed"> = "preprod";
export const APP_NETWORK_LABEL = "Midnight Preprod";

export const PREPROD_CONFIG: SessionInfo = {
  networkId: "preprod",
  indexerUrl: process.env.NEXT_PUBLIC_MIDNIGHT_INDEXER_HTTP_URL ?? "https://indexer.preprod.midnight.network/api/v4/graphql",
  indexerWsUrl: process.env.NEXT_PUBLIC_MIDNIGHT_INDEXER_WS_URL ?? "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
  proofServerUrl: process.env.NEXT_PUBLIC_MIDNIGHT_PROOF_SERVER_URL ?? "http://localhost:6300",
  nodeUrl: process.env.NEXT_PUBLIC_MIDNIGHT_NODE_URL ?? "https://rpc.preprod.midnight.network",
  unshieldedAddress: null,
};

export const NETWORK_CONFIG: Record<Exclude<NetworkId, "undeployed">, SessionInfo> = {
  preprod: {
    ...PREPROD_CONFIG,
  },
};

function networkConfig(network: NetworkId): SessionInfo {
  if (network !== APP_NETWORK) throw new Error("PREPROD_REQUIRED");
  return PREPROD_CONFIG;
}

const INDEXER_BY_NETWORK: Partial<Record<NetworkId, string>> = {
  preprod: "https://indexer.preprod.midnight.network/api/v4/graphql",
};

export type ContractIndexLookup = {
  found: boolean;
  /** Address form that succeeded against the indexer, when found. */
  resolvedAddress: string | null;
  /** Human-readable detail for UI (endpoint / last error). */
  detail: string;
};

/**
 * Midnight JS / Compact (`createUnprovenCallTx`, signing keys) reject a `0x` prefix.
 * Explorer and some UI paths prefer `0x...`. Always convert at the SDK boundary.
 * Strips every leading `0x`/`0X` (and whitespace) until the string is bare hex.
 */
export function toChainContractAddress(contractId: string): string {
  let hex = String(contractId ?? "").trim();
  // Defensive: strip repeated prefixes and accidental whitespace/BOM.
  hex = hex.replace(/^\uFEFF/, "");
  while (/^0x/i.test(hex)) {
    hex = hex.slice(2).trim();
  }
  hex = hex.toLowerCase();
  if (!hex || hex.length % 2 !== 0 || /[^0-9a-f]/.test(hex) || hex.length < 32) {
    throw new Error(`Invalid contract address: ${contractId}`);
  }
  return hex;
}

function contractAddressCandidates(contractId: string): string[] {
  const raw = contractId.trim();
  const noPrefix = raw.replace(/^0x/i, "");
  const lower = noPrefix.toLowerCase();
  const upper = noPrefix.toUpperCase();
  const candidates = [
    raw,
    noPrefix,
    lower,
    upper,
    `0x${lower}`,
    `0x${upper}`,
  ];
  return [...new Set(candidates.filter((value) => value.length > 0))];
}

/**
 * Check whether a contract address is already indexed (no wallet required).
 * Used when restoring a published gate from a known address.
 */
export async function verifyContractIndexed(
  contractId: string,
  network: NetworkId = APP_NETWORK,
  indexerUrlOverride?: string | null,
): Promise<ContractIndexLookup> {
  const hexBody = contractId.replace(/^0x/i, "").trim();
  if (!/^[0-9a-fA-F]+$/.test(hexBody) || hexBody.length < 32 || hexBody.length % 2 !== 0) {
    return {
      found: false,
      resolvedAddress: null,
      detail: "Contract address must be even-length hex (at least 32 characters), optional 0x prefix.",
    };
  }

  const indexerUrl = indexerUrlOverride
    || INDEXER_BY_NETWORK[network]
    || networkConfig(network).indexerUrl;
  const query =
    "query LatestContractState($address: HexEncoded!) { contractAction(address: $address) { __typename state } }";

  let lastError = "";
  for (const address of contractAddressCandidates(contractId)) {
    try {
      const data = await queryIndexer(indexerUrl, query, { address });
      const action = data.contractAction as { state?: string; __typename?: string } | null | undefined;
      if (action?.state || action?.__typename) {
        return {
          found: true,
          // Always bare hex - never re-save the 0x form the indexer accepted as a query string.
          resolvedAddress: toChainContractAddress(address),
          detail: `Indexed via ${indexerUrl}`,
        };
      }
    } catch (error) {
      lastError = getErrorMessage(error);
    }
  }

  return {
    found: false,
    resolvedAddress: null,
    detail: lastError
      ? `Indexer lookup failed (${indexerUrl}): ${lastError}`
      : `No contract state at this address on ${network} (${indexerUrl}).`,
  };
}

export function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexToUint8Array(hex: string): Uint8Array {
  const normalized = hex.replace(/^0x/, "");
  if (normalized.length % 2 !== 0 || /[^0-9a-f]/i.test(normalized)) {
    throw new Error("Wallet returned an invalid hexadecimal transaction.");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/** Compact runtime requires a real ArrayBuffer-backed Uint8Array of length 32 (not a view/SharedArrayBuffer). */
function ensureBytes32(value: Uint8Array): Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== 32) {
    throw new Error("Expected exactly 32 bytes.");
  }
  const copy = new Uint8Array(32);
  copy.set(value);
  return copy;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Wallet keys must stay as hex/bech32 strings - never String(Uint8Array) / String(object). */
function walletKeyToString(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (value instanceof Uint8Array) return uint8ArrayToHex(value);
  if (value instanceof ArrayBuffer) return uint8ArrayToHex(new Uint8Array(value));
  if (Array.isArray(value)) return uint8ArrayToHex(new Uint8Array(value));
  if (value && typeof value === "object") {
    const objectValue = value as { toHexString?: () => string; data?: unknown; bytes?: unknown };
    if (typeof objectValue.toHexString === "function") return objectValue.toHexString();
    if (objectValue.data !== undefined) return walletKeyToString(objectValue.data);
    if (objectValue.bytes !== undefined) return walletKeyToString(objectValue.bytes);
  }
  throw new Error("Wallet returned an unsupported key format.");
}

const SIGNING_KEY_STORAGE = "midnight_signing_keys";
let sharedConnectionPromise: Promise<SessionInfo> | null = null;
let sharedConnectionKey: string | null = null;

function persistSigningKey(contractAddress: string, signingKey: unknown): void {
  if (typeof window === "undefined" || signingKey == null) return;
  try {
    const serialized = typeof signingKey === "string" ? signingKey : JSON.stringify(signingKey);
    const store = JSON.parse(window.localStorage.getItem(SIGNING_KEY_STORAGE) ?? "{}") as Record<string, string>;
    // Store under bare hex (SDK form) and legacy 0x form for older sessions.
    const chain = contractAddress.replace(/^0x/i, "").toLowerCase();
    store[chain] = serialized;
    store[`0x${chain}`] = serialized;
    store[contractAddress] = serialized;
    window.localStorage.setItem(SIGNING_KEY_STORAGE, JSON.stringify(store));
  } catch {
    // localStorage may be unavailable; in-memory privateStateProvider still works for this session.
  }
}

function loadSigningKey(contractAddress: string): unknown | null {
  if (typeof window === "undefined") return null;
  try {
    const store = JSON.parse(window.localStorage.getItem(SIGNING_KEY_STORAGE) ?? "{}") as Record<string, string>;
    let raw: string | undefined;
    for (const key of contractAddressCandidates(contractAddress)) {
      if (store[key]) {
        raw = store[key];
        break;
      }
    }
    if (!raw) return null;
    if (raw.startsWith("{") || raw.startsWith("[")) return JSON.parse(raw);
    return raw;
  } catch {
    return null;
  }
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const details = error as { code?: unknown; name?: unknown; message?: unknown; error?: { code?: unknown; name?: unknown; message?: unknown } };
    const code = typeof details.code === "string" ? details.code : typeof details.error?.code === "string" ? details.error.code : "";
    const message = typeof details.message === "string" ? details.message : typeof details.error?.message === "string" ? details.error.message : "";
    const name = typeof details.name === "string" ? details.name : typeof details.error?.name === "string" ? details.error.name : "";
    if (code || name || message) return [code, name, message].filter(Boolean).join(": ");
  }
  return "The wallet request could not be completed.";
}

function toBigInt(value: bigint | number | string): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

function normalizeTxHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) return null;
  const prefixBytes = hexToUint8Array(normalized.slice(0, Math.min(normalized.length, 48)));
  const asciiPrefix = Array.from(prefixBytes, (byte) => String.fromCharCode(byte)).join("");
  if (asciiPrefix.startsWith("midnight:transaction")) return null;
  return normalized;
}

function extractTxHash(value: unknown): string | null {
  const direct = normalizeTxHash(value);
  if (direct) return direct;
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  for (const key of ["txHash", "transactionHash", "hash", "txId", "transactionId", "id"]) {
    const hash = normalizeTxHash(record[key]);
    if (hash) return hash;
  }
  for (const key of ["transaction", "result", "data"]) {
    const nested = extractTxHash(record[key]);
    if (nested) return nested;
  }
  return null;
}

function explicitFailedWalletStatus(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.error != null) return getErrorMessage(record.error);
  for (const key of ["status", "txStatus", "transactionStatus", "result", "state"]) {
    const raw = record[key];
    if (typeof raw !== "string") continue;
    const normalized = raw.toLowerCase();
    if (["fail", "failed", "failure", "rejected", "error"].includes(normalized)) return raw;
  }
  for (const key of ["transaction", "data"]) {
    const nested = explicitFailedWalletStatus(record[key]);
    if (nested) return nested;
  }
  return null;
}

function logTxDiagnostics(label: string, info: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  try {
    console.info(`[Midnight:${label}]`, info);
  } catch {
    // diagnostics only
  }
}

async function queryIndexer(
  indexerUrl: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(indexerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`Indexer HTTP ${response.status}`);
  const payload = await response.json() as { data?: Record<string, unknown>; errors?: Array<{ message?: string }> };
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message ?? "Indexer query failed").join("; "));
  return payload.data ?? {};
}

async function decodeCoinPublicKey(value: unknown, networkId: NetworkId): Promise<Uint8Array> {
  if (value instanceof Uint8Array) {
    if (value.length !== 32) throw new Error("Wallet returned an invalid coin public key length.");
    return ensureBytes32(value);
  }

  if (value instanceof ArrayBuffer) return decodeCoinPublicKey(new Uint8Array(value), networkId);
  if (Array.isArray(value)) return decodeCoinPublicKey(new Uint8Array(value), networkId);

  if (typeof value === "object" && value !== null) {
    const objectValue = value as { data?: unknown; bytes?: unknown; toHexString?: () => string };
    if (typeof objectValue.toHexString === "function") return decodeCoinPublicKey(objectValue.toHexString(), networkId);
    if (objectValue.data !== undefined) return decodeCoinPublicKey(objectValue.data, networkId);
    if (objectValue.bytes !== undefined) return decodeCoinPublicKey(objectValue.bytes, networkId);
  }

  if (typeof value !== "string") {
    const type = value === null ? "null" : typeof value;
    throw new Error(`KEY_FORMAT:Wallet returned ${type} instead of a supported coin public key.`);
  }

  const normalized = value.replace(/^0x/, "");
  if (/^[0-9a-f]{64}$/i.test(normalized)) return ensureBytes32(hexToUint8Array(normalized));

  const { MidnightBech32m } = await import("@midnight-ntwrk/wallet-sdk-address-format");
  try {
    const encoded = MidnightBech32m.parse(value);
    if (encoded.type !== "shield-cpk" && encoded.type !== "shield-addr") {
      throw new Error(`Wallet returned Bech32m type ${encoded.type}, expected shield-cpk or shield-addr.`);
    }
    if (encoded.network !== networkId) {
      throw new Error(`Expected ${networkId} key, got ${String(encoded.network)} key.`);
    }
    const bytes = new Uint8Array(encoded.data.slice(0, 32));
    if (bytes.length !== 32) throw new Error("Wallet returned an invalid coin public key length.");
    return ensureBytes32(bytes);
  } catch (error) {
    const message = getErrorMessage(error);
    if (/Expected .*?, got .* key/i.test(message) || /network/i.test(message)) {
      throw new Error(`KEY_NETWORK:${message}`);
    }
    throw new Error(`KEY_FORMAT:${message}`);
  }
}

function createPrivateStateProvider() {
  let contractAddress = "";
  const states = new Map<string, unknown>();
  const signingKeys = new Map<string, unknown>();
  const scoped = (id: string) => `${contractAddress}:${id}`;

  return {
    setContractAddress: (address: string) => {
      contractAddress = address.replace(/^0x/i, "").toLowerCase();
    },
    get: async (id: string) => states.get(scoped(id)) ?? null,
    set: async (id: string, value: unknown) => { states.set(scoped(id), value); },
    remove: async (id: string) => { states.delete(scoped(id)); },
    clear: async () => { states.clear(); },
    getSigningKey: async (address: string) => {
      for (const key of contractAddressCandidates(address)) {
        const found = signingKeys.get(key);
        if (found != null) return found;
      }
      return null;
    },
    setSigningKey: async (address: string, key: unknown) => {
      const chain = address.replace(/^0x/i, "").toLowerCase();
      signingKeys.set(chain, key);
      signingKeys.set(`0x${chain}`, key);
      signingKeys.set(address, key);
    },
    removeSigningKey: async (address: string) => {
      for (const key of contractAddressCandidates(address)) signingKeys.delete(key);
    },
    clearSigningKeys: async () => { signingKeys.clear(); },
    exportPrivateStates: async () => { throw new Error("Private state export is not enabled in this browser session."); },
    importPrivateStates: async () => { throw new Error("Private state import is not enabled in this browser session."); },
    exportSigningKeys: async () => { throw new Error("Signing key export is not enabled in this browser session."); },
    importSigningKeys: async () => { throw new Error("Signing key import is not enabled in this browser session."); },
  };
}

function isWalletLike(value: unknown): value is Pick<InitialAPI, "connect" | "name" | "rdns" | "apiVersion" | "icon"> {
  return typeof value === "object"
    && value !== null
    && typeof (value as { connect?: unknown }).connect === "function";
}

function walletIdentity(wallet: Partial<WalletOption>): string {
  return `${wallet.injectionKey ?? ""} ${wallet.name ?? ""} ${wallet.rdns ?? ""}`.toLowerCase();
}

function normalizeWalletName(wallet: WalletOption): WalletOption {
  if (wallet.injectionKey === "1am" || walletIdentity(wallet).includes("1am")) {
    return { ...wallet, name: "1AM Wallet" };
  }
  if (walletIdentity(wallet).includes("lace") || walletIdentity(wallet).includes("cardano")) {
    return { ...wallet, name: "Lace" };
  }
  return wallet;
}

function isLaceOption(wallet: Partial<WalletOption>): boolean {
  const identity = walletIdentity(wallet);
  return identity.includes("lace") || identity.includes("cardano");
}

function isOneAmOption(wallet: Partial<WalletOption>): boolean {
  return wallet.injectionKey === "1am" || walletIdentity(wallet).includes("1am") || walletIdentity(wallet).includes("1 am");
}

function walletConnectionKey(wallet: WalletOption, network: NetworkId): string {
  return `${network}:${wallet.injectionKey}:${wallet.rdns}:${wallet.apiVersion}`;
}

export class MidnightClient {
  public api: WalletApi | null = null;
  public addresses: WalletAddresses | null = null;
  public session: SessionInfo | null = null;
  public providers: MidnightProviders | null = null;
  public isConnected = false;
  public walletName: string | null = null;
  public walletRdns: string | null = null;
  public walletInjectionKey: string | null = null;
  public isConnecting = false;
  private transactionProgressListener: ((stage: TransactionProgressStage) => void) | null = null;
  private transactionSubmitContext: "credential" | "access" = "credential";

  getInjectedWallets(): WalletOption[] {
    if (typeof window === "undefined") return [];
    const injected = window.midnight ?? {};
    const wallets = Object.entries(injected)
      .filter((entry): entry is [string, Pick<InitialAPI, "connect" | "name" | "rdns" | "apiVersion" | "icon">] => isWalletLike(entry[1]))
      .map(([injectionKey, wallet]) => normalizeWalletName({
        injectionKey,
        connect: wallet.connect.bind(wallet),
        name: wallet.name,
        rdns: wallet.rdns,
        apiVersion: wallet.apiVersion,
        icon: wallet.icon,
      }));

    const oneAm = isWalletLike(injected["1am"])
      ? normalizeWalletName({
          injectionKey: "1am",
          connect: injected["1am"].connect.bind(injected["1am"]),
          name: injected["1am"].name,
          rdns: injected["1am"].rdns,
          apiVersion: injected["1am"].apiVersion,
          icon: injected["1am"].icon,
        })
      : null;
    const lace = wallets.find(isLaceOption) ?? null;
    const ordered = [lace, oneAm, ...wallets.filter((wallet) => !isLaceOption(wallet) && !isOneAmOption(wallet))];
    const seen = new Set<string>();
    return ordered.filter((wallet): wallet is WalletOption => {
      if (!wallet) return false;
      const key = `${wallet.injectionKey}:${wallet.rdns}:${wallet.apiVersion}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return isLaceOption(wallet) || isOneAmOption(wallet);
    });
  }

  async detectWallet(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    return this.getInjectedWallets().length > 0;
  }

  async getCredentialHash(secret: Uint8Array): Promise<Uint8Array> {
    if (secret.length !== 32) throw new Error("Credential must contain exactly 32 bytes.");
    const pureSecret = ensureBytes32(secret);
    const { CompactTypeBytes, CompactTypeVector, persistentHash } = await import("@midnight-ntwrk/compact-runtime");
    const domain = new Uint8Array(32);
    domain.set(new TextEncoder().encode("vault:credential"));
    return ensureBytes32(persistentHash(
      new CompactTypeVector(2, new CompactTypeBytes(32)),
      [domain, pureSecret],
    ));
  }

  private async readWalletTxHashes(pageSize = 20): Promise<Set<string> | null> {
    if (!this.api?.getTxHistory) return null;
    const hashes = new Set<string>();
    let sawHistoryPage = false;
    for (const pageNumber of [0, 1]) {
      try {
        const entries = await this.api.getTxHistory(pageNumber, pageSize);
        sawHistoryPage = true;
        for (const entry of entries ?? []) {
          const hash = extractTxHash(entry);
          if (hash) hashes.add(hash);
        }
      } catch (error) {
        logTxDiagnostics("history-read-failed", {
          wallet: this.walletName,
          pageNumber,
          message: getErrorMessage(error),
        });
      }
    }
    return sawHistoryPage ? hashes : null;
  }

  private async waitForNewWalletTxHash(
    previousHashes: Set<string> | null,
    timeoutMs = 45000,
  ): Promise<string | null> {
    if (!this.api?.getTxHistory || !previousHashes) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const currentHashes = await this.readWalletTxHashes();
      if (!currentHashes) return null;
      for (const hash of currentHashes) {
        if (!previousHashes.has(hash)) return hash;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    return null;
  }

  private walletKind(): WalletKind {
    return this.isOneAmWallet() ? "1am" : "lace";
  }

  private async submitBalancedTransaction(
    tx: SerializedTransaction,
    context: "deploy" | "credential" | "access",
  ): Promise<WalletSubmitResult> {
    this.transactionProgressListener?.("awaiting_wallet");
    if (!this.api?.submitTransaction) throw new Error("Wallet cannot submit a transaction.");
    if (!tx || typeof tx.serialize !== "function") throw new Error("Cannot submit an invalid balanced transaction.");

    let serialized: Uint8Array;
    try {
      serialized = tx.serialize();
    } catch (error) {
      throw new Error(`Failed to serialize balanced transaction before submit: ${getErrorMessage(error)}`);
    }

    const beforeSubmit = await this.readWalletTxHashes();
    const result = await this.api.submitTransaction(uint8ArrayToHex(serialized));
    this.transactionProgressListener?.("submitted");
    const failedStatus = explicitFailedWalletStatus(result);
    if (failedStatus) throw new Error(`Wallet returned failed transaction status: ${failedStatus}`);

    const directHash = extractTxHash(result);
    logTxDiagnostics("submit-result", {
      context,
      wallet: this.walletName,
      resultType: result === null ? "null" : typeof result,
      resultKeys: result && typeof result === "object" ? Object.keys(result as Record<string, unknown>) : [],
      directHash: Boolean(directHash),
      historyAvailable: Boolean(beforeSubmit),
    });
    if (directHash) {
      return {
        submitted: true,
        confirmed: false,
        txHash: directHash,
        wallet: this.walletKind(),
        status: "submitted",
        rawResult: result,
      };
    }

    const historyHash = await this.waitForNewWalletTxHash(beforeSubmit);
    logTxDiagnostics("submit-history", {
      context,
      wallet: this.walletName,
      historyHash: Boolean(historyHash),
    });
    return {
      submitted: true,
      confirmed: historyHash ? false : true,
      txHash: historyHash,
      wallet: this.walletKind(),
      status: historyHash ? "submitted" : "confirmed",
      rawResult: result,
    };
  }

  private async submitBalancedTransactionForHash(
    tx: SerializedTransaction,
    context: "deploy" | "credential" | "access",
  ): Promise<string | null> {
    const result = await this.submitBalancedTransaction(tx, context);
    return result.txHash;
  }

  private async findWallet(selectedWallet?: WalletOption): Promise<WalletOption> {
    if (typeof window === "undefined") throw new Error("Wallet connection is only available in a browser.");
    if (selectedWallet) return selectedWallet;
    const deadline = Date.now() + 6000;

    while (Date.now() < deadline) {
      const wallets = this.getInjectedWallets();
      const oneAm = wallets.find(isOneAmOption);
      const lace = wallets.find(isLaceOption);
      const wallet = lace ?? oneAm;
      if (wallet) return wallet;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }

    throw new Error("NO_WALLET");
  }

  private async currentConnectionStatus(network: NetworkId, selectedWallet?: WalletOption): Promise<SessionInfo | null> {
    if (!this.api || !this.session || !this.isConnected) return null;
    if (selectedWallet) {
      const sameWallet = this.walletInjectionKey === selectedWallet.injectionKey
        && this.walletRdns === selectedWallet.rdns;
      if (!sameWallet) return null;
    }

    if (this.api.getConnectionStatus) {
      try {
        const status = await this.api.getConnectionStatus();
        if (status.status !== "connected") return null;
        if ("networkId" in status && status.networkId !== network) {
          throw new Error(`NETWORK_MISMATCH:${status.networkId}`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("NETWORK_MISMATCH:")) throw error;
        return null;
      }
    }

    if (this.session.networkId !== network) throw new Error(`NETWORK_MISMATCH:${this.session.networkId}`);
    return this.session;
  }

  async connectWallet(network: NetworkId = APP_NETWORK, selectedWallet?: WalletOption): Promise<SessionInfo> {
    if (network !== APP_NETWORK) throw new Error(`NETWORK_MISMATCH:${network}`);
    const existing = await this.currentConnectionStatus(network, selectedWallet);
    if (existing) return existing;

    const wallet = await this.findWallet(selectedWallet);
    const connectionKey = walletConnectionKey(wallet, network);
    if (sharedConnectionPromise) {
      if (sharedConnectionKey === connectionKey) return sharedConnectionPromise;
      throw new Error("WALLET_CONNECT_PENDING");
    }

    this.isConnecting = true;
    sharedConnectionKey = connectionKey;
    sharedConnectionPromise = (async () => {
      let api: WalletApi;
      try {
        api = await wallet.connect(network) as unknown as WalletApi;
      } catch (error) {
        const message = getErrorMessage(error);
        if (message.toLowerCase().includes("already pending")) throw new Error("WALLET_CONNECT_ALREADY_PENDING");
        throw new Error(`WALLET_CONNECT_FAILED:${message}`);
      }
      if (api.hintUsage) {
        try {
          const methods: Array<keyof NonNullable<typeof api>> = [];
          if (api.getShieldedAddresses) methods.push("getShieldedAddresses");
          if (api.getProvingProvider) methods.push("getProvingProvider");
          if (api.balanceUnsealedTransaction) methods.push("balanceUnsealedTransaction");
          if (api.submitTransaction) methods.push("submitTransaction");
          await api.hintUsage(methods as never);
        } catch (error) {
          throw new Error(`WALLET_PERMISSION_FAILED:${getErrorMessage(error)}`);
        }
      }
      if (api.getConnectionStatus) {
        try {
          const status = await api.getConnectionStatus();
          if (status.status !== "connected") throw new Error("WALLET_DISCONNECTED");
          if ("networkId" in status && status.networkId !== network) {
            throw new Error(`NETWORK_MISMATCH:${status.networkId}`);
          }
        } catch (error) {
          if (error instanceof Error && (error.message === "WALLET_DISCONNECTED" || error.message.startsWith("NETWORK_MISMATCH:"))) throw error;
          throw new Error(`WALLET_STATUS_FAILED:${getErrorMessage(error)}`);
        }
      }
      if (!api.getConfiguration) throw new Error("WALLET_CONFIG_UNAVAILABLE");
      const [configuration, address] = await Promise.all([
        api.getConfiguration(),
        api.getUnshieldedAddress?.() ?? Promise.resolve({}),
      ]);

      const config = configuration as Record<string, unknown>;
      const actualNetwork = getString(config.networkId);
      if (actualNetwork && actualNetwork !== network) throw new Error(`NETWORK_MISMATCH_CONFIG:${actualNetwork}`);
      const fallback = networkConfig(network);
      const session: SessionInfo = {
        networkId: APP_NETWORK,
        indexerUrl: getString(config.indexerUri) ?? fallback.indexerUrl,
        indexerWsUrl: getString(config.indexerWsUri) ?? fallback.indexerWsUrl,
        proofServerUrl: getString(config.proverServerUri) ?? fallback.proofServerUrl,
        nodeUrl: getString(config.substrateNodeUri) ?? fallback.nodeUrl,
        unshieldedAddress: (address as { unshieldedAddress?: string }).unshieldedAddress ?? null,
      };

      this.api = api as unknown as WalletApi;
      this.walletName = wallet.name;
      this.walletRdns = wallet.rdns;
      this.walletInjectionKey = wallet.injectionKey;
      this.addresses = null;
      this.providers = null;
      this.session = session;
      this.isConnected = true;
      return session;
    })();

    try {
      return await sharedConnectionPromise;
    } finally {
      this.isConnecting = false;
      sharedConnectionPromise = null;
      sharedConnectionKey = null;
    }
  }

  async loadWalletAddresses(): Promise<WalletAddresses> {
    if (!this.api) throw new Error("WALLET_NOT_CONNECTED");
    if (!this.addresses) {
      if (!this.api.getShieldedAddresses) throw new Error("Wallet did not expose shielded transaction keys.");
      this.addresses = await this.api.getShieldedAddresses();
    }
    return this.addresses;
  }

  /**
   * Clear the local Midnight wallet session.
   * If the extension exposes disconnect(), call it so the dApp is no longer authorized.
   */
  async disconnect(): Promise<void> {
    const api = this.api;
    this.api = null;
    this.addresses = null;
    this.session = null;
    this.providers = null;
    this.isConnected = false;
    this.walletName = null;
    this.walletRdns = null;
    this.walletInjectionKey = null;
    this.isConnecting = false;
    this.transactionProgressListener = null;

    if (api?.disconnect) {
      try {
        await api.disconnect();
      } catch {
        // Extension may not implement disconnect; local session is already cleared.
      }
    }
  }

  dispose(): void {
    this.transactionProgressListener = null;
  }

  private async ensureProviders(onProgress?: (stage: TransactionProgressStage) => void): Promise<MidnightProviders> {
    this.transactionProgressListener = onProgress ?? null;
    if (!this.isConnected) throw new Error("WALLET_NOT_CONNECTED");
    if (!this.providers) {
      try {
        await this.buildProviders();
      } catch (error) {
        throw new Error(`WALLET_SESSION:${getErrorMessage(error)}`);
      }
    }
    if (!this.providers) throw new Error("WALLET_SESSION:Unable to initialize the Midnight transaction session.");
    return this.providers;
  }

  private async buildProviders() {
    if (!this.api || !this.session) throw new Error("WALLET_NOT_CONNECTED");
    if (!this.addresses) {
      if (!this.api.getShieldedAddresses) throw new Error("Wallet did not expose shielded transaction keys.");
      this.addresses = await this.api.getShieldedAddresses();
    }
    const [{ setNetworkId }, { FetchZkConfigProvider }, { indexerPublicDataProvider }, { ContractState }, { LedgerParameters, ZswapChainState }] =
      await Promise.all([
        import("@midnight-ntwrk/midnight-js-network-id"),
        import("@midnight-ntwrk/midnight-js-fetch-zk-config-provider"),
        import("@midnight-ntwrk/midnight-js-indexer-public-data-provider"),
        import("@midnight-ntwrk/compact-runtime"),
        import("@midnight-ntwrk/ledger-v8"),
      ]);

    setNetworkId(this.session.networkId);
    const assetBaseUrl = new URL("/contract/Midnight/", window.location.origin).toString();
    const zkConfigProvider = new FetchZkConfigProvider(assetBaseUrl, window.fetch.bind(window));
    for (const circuitId of ["add_valid_credential", "verify_access"] as const) {
      try {
        await zkConfigProvider.getZKIR(circuitId);
      } catch (error) {
        throw new Error(`DEPLOY_ZK_ASSETS:${circuitId}:${assetBaseUrl}zkir/${circuitId}.bzkir:${getErrorMessage(error)}`);
      }
    }
    const basePublicDataProvider = indexerPublicDataProvider(this.session.indexerUrl, this.session.indexerWsUrl);
    // Always strip 0x before any public-data call - base SDK asserts bare ContractAddress.
    const chainAddr = (address: string) => {
      try {
        return toChainContractAddress(address);
      } catch {
        return String(address ?? "").replace(/^0x/i, "").toLowerCase();
      }
    };
    const publicDataProvider = this.session.networkId === APP_NETWORK
      ? {
          ...basePublicDataProvider,
          queryContractState: async (contractAddress: string, config?: unknown) => {
            const address = chainAddr(contractAddress);
            if (config) return basePublicDataProvider.queryContractState(address, config as never);
            const data = await queryIndexer(
              this.session!.indexerUrl,
              "query LatestContractState($address: HexEncoded!) { contractAction(address: $address) { state } }",
              { address },
            );
            const action = data.contractAction as { state?: string } | null | undefined;
            return action?.state ? ContractState.deserialize(hexToUint8Array(action.state)) : null;
          },
          queryZSwapAndContractState: async (contractAddress: string, config?: unknown) => {
            const address = chainAddr(contractAddress);
            if (config) return basePublicDataProvider.queryZSwapAndContractState(address, config as never);
            try {
              const data = await queryIndexer(
                this.session!.indexerUrl,
                "query LatestContractAndZswapState($address: HexEncoded!) { contractAction(address: $address) { state zswapState transaction { block { ledgerParameters } } } }",
                { address },
              );
              const action = data.contractAction as {
                state?: string;
                zswapState?: string;
                transaction?: { block?: { ledgerParameters?: string | null } | null } | null;
              } | null | undefined;
              if (!action?.state) return null;
              // Some indexer responses omit zswapState for pure contract calls; empty state is valid for enrollment.
              const zswap = action.zswapState
                ? ZswapChainState.deserialize(hexToUint8Array(action.zswapState))
                : new ZswapChainState();
              return [
                zswap,
                ContractState.deserialize(hexToUint8Array(action.state)),
                action.transaction?.block?.ledgerParameters
                  ? LedgerParameters.deserialize(hexToUint8Array(action.transaction.block.ledgerParameters))
                  : LedgerParameters.initialParameters(),
              ];
            } catch {
              // Fall back to the SDK provider if the custom GraphQL shape fails.
              try {
                return await basePublicDataProvider.queryZSwapAndContractState(address);
              } catch {
                return null;
              }
            }
          },
        }
      : {
          ...basePublicDataProvider,
          queryContractState: async (contractAddress: string, config?: unknown) =>
            basePublicDataProvider.queryContractState(chainAddr(contractAddress), config as never),
          queryZSwapAndContractState: async (contractAddress: string, config?: unknown) =>
            basePublicDataProvider.queryZSwapAndContractState(chainAddr(contractAddress), config as never),
        };
    let provingProvider: unknown = null;
    try {
      provingProvider = this.api.getProvingProvider
        ? await this.api.getProvingProvider(zkConfigProvider)
        : null;
    } catch (error) {
      throw new Error(`DEPLOY_PROVER:${getErrorMessage(error)}`);
    }
    if (!provingProvider) throw new Error("This wallet cannot provide a proof service.");

    const coinPublicKey = this.addresses.shieldedCoinPublicKey ?? this.addresses.coinPublicKey;
    const encryptionPublicKey = this.addresses.shieldedEncryptionPublicKey ?? this.addresses.encryptionPublicKey;
    if (!coinPublicKey || !encryptionPublicKey) throw new Error("Wallet did not return the keys required for a Midnight transaction.");

    const coinPublicKeyString = walletKeyToString(coinPublicKey);
    const encryptionPublicKeyString = walletKeyToString(encryptionPublicKey);
    const progress = (stage: TransactionProgressStage) => this.transactionProgressListener?.(stage);

    // Keep balanced txs as raw hex wrappers. Re-hydrating via Transaction.deserialize() across
    // separately loaded ledger WASM instances causes "__wbg_ptr" crashes in the browser.
    const wrapBalancedHex = (txHex: string): SerializedTransaction => {
      const bytes = hexToUint8Array(txHex);
      return {
        serialize: () => bytes,
      };
    };

    const walletProvider = {
      getCoinPublicKey: () => coinPublicKeyString,
      getEncryptionPublicKey: () => encryptionPublicKeyString,
      balanceTx: async (tx: SerializedTransaction) => {
        progress("balancing");
        if (!this.api?.balanceUnsealedTransaction) throw new Error("Wallet cannot balance a transaction.");
        if (!tx || typeof tx.serialize !== "function") throw new Error("Cannot balance an invalid proven transaction.");
        let serialized: Uint8Array;
        try {
          serialized = tx.serialize();
        } catch (error) {
          throw new Error(`Failed to serialize proven transaction before balancing: ${getErrorMessage(error)}`);
        }
        const balancedHex = await this.balanceUnsealedHex(uint8ArrayToHex(serialized));
        return wrapBalancedHex(balancedHex);
      },
    };
    const midnightProvider = {
      submitTx: async (tx: SerializedTransaction) => this.submitBalancedTransactionForHash(tx, this.transactionSubmitContext),
    };

    const proofProvider = {
      proveTx: async (unprovenTx: { prove?: (provider: unknown, costModel: unknown) => Promise<unknown> }) => {
        progress("proving");
        if (!unprovenTx || typeof unprovenTx.prove !== "function") {
          throw new Error("Unproven transaction is missing prove().");
        }
        const { CostModel } = await import("@midnight-ntwrk/ledger-v8");
        const costModel = CostModel.initialCostModel();
        if (!costModel) throw new Error("Ledger CostModel failed to initialize (WASM).");
        let proven: unknown;
        try {
          // Keep method receiver so WASM bindings retain their internal pointer.
          proven = await unprovenTx.prove(provingProvider, costModel);
        } catch (error) {
          const detail = getErrorMessage(error);
          if (detail.includes("__wbg_ptr")) {
            throw new Error(
              "WASM proof binding failed (__wbg_ptr). Hard-reload the page, reconnect the wallet on the gate network, and retry. If this persists, restart the browser so a single ledger WASM instance is loaded.",
            );
          }
          throw error;
        }
        if (!proven || typeof (proven as SerializedTransaction).serialize !== "function") {
          throw new Error("Proof generation returned an invalid transaction object.");
        }
        return proven;
      },
    };

    const privateStateProvider = createPrivateStateProvider();
    const providers = {
      privateStateProvider,
      publicDataProvider,
      zkConfigProvider,
      proofProvider,
      walletProvider,
      midnightProvider,
    } as unknown as MidnightProviders;
    this.providers = providers;
    return providers;
  }

  private async ensureContractSigningKey(contractAddress: string): Promise<void> {
    if (!this.providers) return;
    const chainAddress = toChainContractAddress(contractAddress);
    const existing = await this.providers.privateStateProvider.getSigningKey(chainAddress);
    if (existing) return;
    const saved = loadSigningKey(chainAddress);
    if (saved != null) {
      await this.providers.privateStateProvider.setSigningKey(chainAddress, saved as never);
    }
  }

  async deployContract(): Promise<{ contractId: string; txId: string | null }> {
    let providers: MidnightProviders;
    try {
      providers = await this.buildProviders();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("DEPLOY_")) throw error;
      throw new Error(`DEPLOY_PROVIDER:${getErrorMessage(error)}`);
    }
    const [{ Contract }, { CompiledContract }, { createUnprovenDeployTx }, { sampleSigningKey }] =
      await Promise.all([
        import("../../public/contract/Midnight/contract/index.js"),
        import("@midnight-ntwrk/compact-js"),
        import("@midnight-ntwrk/midnight-js-contracts"),
        import("@midnight-ntwrk/compact-runtime"),
      ]);
    const witnesses = {
      get_secret: () => [null, new Uint8Array(32)] as [null, Uint8Array],
      get_merkle_path: (_context: unknown, leaf: Uint8Array) => [null, { leaf, path: [] }] as [null, { leaf: Uint8Array; path: never[] }],
      get_caller: () => [null, new Uint8Array(32)] as [null, Uint8Array],
    };
    const compiledContract = CompiledContract.make("Midnight", Contract)
      .pipe(CompiledContract.withWitnesses(witnesses), CompiledContract.withCompiledFileAssets("/contract/Midnight"));
    const publicKey = this.addresses?.shieldedCoinPublicKey ?? this.addresses?.coinPublicKey;
    if (!publicKey || !this.session) throw new Error("Wallet did not return an administrator key.");
    let adminKey: Uint8Array;
    try {
      adminKey = await decodeCoinPublicKey(publicKey, this.session.networkId);
    } catch (error) {
      throw new Error(`DEPLOY_KEY:${getErrorMessage(error)}`);
    }

    const signingKey = sampleSigningKey();
    let txData: { public: { contractAddress: unknown }; private: { unprovenTx: unknown; signingKey?: unknown } };
    try {
      txData = await createUnprovenDeployTx(providers as never, {
        compiledContract,
        args: [ensureBytes32(adminKey)],
        initialPrivateState: {},
        signingKey,
      } as never);
    } catch (error) {
      throw new Error(`DEPLOY_BUILD:${getErrorMessage(error)}`);
    }

    let provenTx: SerializedTransaction;
    if (this.isLaceWallet() && this.api?.getDustBalance) {
      try {
        const dust = await this.api.getDustBalance();
        const balance = toBigInt(dust.balance);
        if (balance <= BigInt(0)) throw new Error(`DUST_EMPTY:${String(dust.cap)}`);
      } catch (error) {
        if (error instanceof Error && error.message === "DUST_EMPTY") throw error;
      }
    }
    try {
      provenTx = await (providers as unknown as {
        proofProvider: { proveTx: (tx: unknown) => Promise<unknown> };
      }).proofProvider.proveTx(txData.private.unprovenTx) as SerializedTransaction;
    } catch (error) {
      throw new Error(`DEPLOY_PROVE:${getErrorMessage(error)}`);
    }

    let balancedHex: string;
    let dustStatus = "unavailable";
    try {
      if (!this.api?.balanceUnsealedTransaction) throw new Error("Wallet cannot balance a transaction.");
      if (this.api.getDustBalance) {
        try {
          const dust = await this.api.getDustBalance();
          dustStatus = toBigInt(dust.balance) > BigInt(0) ? "available" : "empty";
        } catch {
          dustStatus = "unavailable";
        }
      }
      balancedHex = await this.balanceUnsealedHex(uint8ArrayToHex(provenTx.serialize()));
    } catch (error) {
      const detail = getErrorMessage(error);
      throw new Error(`DEPLOY_BALANCE:dust=${dustStatus}:${detail}`);
    }

    // Derive contractId before submit so we can persist the signing key even on failure.
    const contractId = toChainContractAddress(String(txData.public.contractAddress));
    const storedSigningKey = txData.private.signingKey ?? signingKey;
    const persistKey = async () => {
      try {
        providers.privateStateProvider.setContractAddress(contractId);
        await providers.privateStateProvider.setSigningKey(contractId, storedSigningKey as never);
        persistSigningKey(contractId, storedSigningKey);
      } catch {
        // Signing key persistence is best-effort.
      }
    };

    let txId: string | null;
    try {
      txId = await this.submitBalancedTransactionForHash({ serialize: () => hexToUint8Array(balancedHex) }, "deploy");
    } catch (error) {
      // Even if submit throws, Lace sometimes broadcasts first. Persist the signing key so the
      // operator can use "Check deployment confirmation". For "temporarily banned" the tx did
      // not land - still persist so a short confirmation poll can prove absence if needed.
      await persistKey();
      const raw = error as Record<string, unknown> | null;
      const code = typeof raw?.code === "string" ? raw.code : typeof raw?.error === "object" && raw?.error !== null ? (raw.error as Record<string,unknown>).code : "";
      const detail = [code, getErrorMessage(error)].filter(Boolean).join(" | ");
      throw new Error(`DEPLOY_SUBMIT:contractId=${contractId}:${detail}`);
    }
    await persistKey();

    // 1AM resolves submitTransaction with void/undefined even when the transaction was
    // successfully broadcast and confirmed on-chain. Instead of throwing, allow the deploy
    // flow to proceed to waitForContractDeployment() which polls the indexer by contractAddress
    // and does not require a txId.
    if (!txId && this.isOneAmWallet()) {
      console.warn(
        `[Midnight] 1AM returned no transaction id for deploy (contractId=${contractId}). ` +
        `Proceeding to indexer confirmation - the tx may have been broadcast successfully.`,
      );
    }
    return { contractId, txId };
  }

  async waitForContractDeployment(contractId: string, timeoutMs = 600000, onProgress?: (elapsed: number) => void): Promise<void> {
    if (!this.session) throw new Error("WALLET_NOT_CONNECTED");
    const deadline = Date.now() + timeoutMs;
    const startedAt = Date.now();
    let lastError = "";
    const addresses = contractAddressCandidates(contractId);

    while (Date.now() < deadline) {
      onProgress?.(Math.floor((Date.now() - startedAt) / 1000));
      for (const address of addresses) {
        try {
          const response = await fetch(this.session.indexerUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              query: "query LatestContractState($address: HexEncoded!) { contractAction(address: $address) { state } }",
              variables: { address },
            }),
          });
          if (!response.ok) throw new Error(`Indexer HTTP ${response.status}`);
          const payload = await response.json() as { data?: { contractAction?: { state?: string } | null }; errors?: Array<{ message?: string }> };
          if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message ?? "Indexer query failed").join("; "));
          // contractAction === null means the contract does not exist at this address.
          // Only treat as confirmed when contractAction is non-null AND has a state value.
          const action = payload.data?.contractAction;
          if (action !== null && action !== undefined && action.state) return;
        } catch (error) {
          lastError = getErrorMessage(error);
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 5000));
    }

    throw new Error(`DEPLOY_CONFIRM:${lastError || "The contract is not indexed yet."}`);
  }

  async waitForTransaction(transactionId: string, timeoutMs = 120000): Promise<void> {
    if (!this.session) throw new Error("WALLET_NOT_CONNECTED");
    const deadline = Date.now() + timeoutMs;
    let lastError = "";
    while (Date.now() < deadline) {
      try {
        const response = await fetch(this.session.indexerUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            query: "query TransactionResult($identifier: HexEncoded!) { transactions(offset: { identifier: $identifier }) { transactionResult { status } } }",
            variables: { identifier: transactionId },
          }),
        });
        if (!response.ok) throw new Error(`Indexer HTTP ${response.status}`);
        const payload = await response.json() as { data?: { transactions?: Array<{ transactionResult?: { status?: string } | null }> }; errors?: Array<{ message?: string }> };
        if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message ?? "Indexer query failed").join("; "));
        const status = payload.data?.transactions?.[0]?.transactionResult?.status;
        if (status === "FAILURE" || status === "FAILED") throw new Error(`CREDENTIAL_CONFIRM_FAILED:${status}`);
        if (status === "SUCCESS" || status === "PARTIAL_SUCCESS") return;
      } catch (error) {
        const message = getErrorMessage(error);
        if (message.startsWith("CREDENTIAL_CONFIRM_FAILED:")) throw new Error(message);
        lastError = message;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }
    throw new Error(`CREDENTIAL_CONFIRM:${lastError || "The enrollment transaction is still pending."}`);
  }

  isLaceWallet(): boolean {
    const identity = `${this.walletName ?? ""} ${this.walletRdns ?? ""}`.toLowerCase();
    return identity.includes("lace") || identity.includes("cardano");
  }

  isOneAmWallet(): boolean {
    const identity = `${this.walletName ?? ""} ${this.walletRdns ?? ""}`.toLowerCase();
    return identity.includes("1am") || identity.includes("1 am");
  }

  /**
   * Balance a proven unsealed tx via the wallet.
   * Lace needs `{ payFees: true }` so the user pays DUST.
   * 1AM sponsors fees through ProofStation - pass no options (skill default). Falling back
   * to payFees only if the no-options path fails keeps both wallets working.
   */
  private async balanceUnsealedHex(txHex: string): Promise<string> {
    if (!this.api?.balanceUnsealedTransaction) throw new Error("Wallet cannot balance a transaction.");

    const tryBalance = async (options?: { payFees?: boolean }) => {
      const result = options === undefined
        ? await this.api!.balanceUnsealedTransaction!(txHex)
        : await this.api!.balanceUnsealedTransaction!(txHex, options);
      if (!result?.tx || typeof result.tx !== "string") throw new Error("Wallet returned no balanced transaction.");
      return result.tx;
    };

    if (this.isOneAmWallet()) {
      try {
        return await tryBalance();
      } catch (firstError) {
        try {
          return await tryBalance({ payFees: true });
        } catch {
          throw firstError;
        }
      }
    }

    // Lace / other wallets: prefer explicit fee payment from the connected account.
    try {
      return await tryBalance({ payFees: true });
    } catch (firstError) {
      try {
        return await tryBalance();
      } catch {
        throw firstError;
      }
    }
  }

  async verifyCredential(secret: Uint8Array, contractId: string, onProgress?: (stage: TransactionProgressStage) => void): Promise<AccessVerificationResult> {
    onProgress?.("preparing");
    const providers = await this.ensureProviders(onProgress);
    if (!this.addresses) throw new Error("WALLET_SESSION:Wallet did not return shielded addresses.");
    if (!contractId) throw new Error("GATE_NOT_CONFIGURED");
    if (secret.length !== 32) throw new Error("CREDENTIAL_FORMAT");
    const pureSecret = ensureBytes32(secret);
    const chainAddress = toChainContractAddress(contractId);

    const [{ Contract }, { CompiledContract }, { createUnprovenCallTx }] = await Promise.all([
      import("../../public/contract/Midnight/contract/index.js"),
      import("@midnight-ntwrk/compact-js"),
      import("@midnight-ntwrk/midnight-js-contracts"),
    ]);
    const caller = this.addresses.shieldedCoinPublicKey ?? this.addresses.coinPublicKey;
    if (!caller || !this.session) throw new Error("Wallet returned an invalid public key.");
    const callerBytes = ensureBytes32(await decodeCoinPublicKey(caller, this.session.networkId));
    await this.ensureContractSigningKey(chainAddress);

    // Preflight membership so the member gets a clear error before proving.
    try {
      const hash = ensureBytes32(await this.getCredentialHash(pureSecret));
      if (!(await this.isCredentialEnrolled(chainAddress, hash))) {
        throw new Error("CREDENTIAL_NOT_ENROLLED");
      }
    } catch (error) {
      const message = getErrorMessage(error);
      if (message === "CREDENTIAL_NOT_ENROLLED") throw error;
      throw new Error(`CREDENTIAL_CHECK:${message}`);
    }

    const witnesses = {
      get_secret: (context: { privateState: unknown }) => [context.privateState, pureSecret] as [unknown, Uint8Array],
      get_merkle_path: (context: { ledger: { valid_credentials: { findPathForLeaf: (leaf: Uint8Array) => unknown } }; privateState: unknown }, leaf: Uint8Array) => {
        const path = context.ledger.valid_credentials.findPathForLeaf(ensureBytes32(leaf));
        if (!path) throw new Error("CREDENTIAL_NOT_ENROLLED");
        return [context.privateState, path] as [unknown, unknown];
      },
      get_caller: (context: { privateState: unknown }) => [context.privateState, callerBytes] as [unknown, Uint8Array],
    };
    const compiledContract = CompiledContract.make("Midnight", Contract)
      .pipe(CompiledContract.withWitnesses(witnesses), CompiledContract.withCompiledFileAssets("/contract/Midnight"));

    const sdkContractAddress = toChainContractAddress(chainAddress);
    providers.privateStateProvider.setContractAddress(sdkContractAddress);

    let callTxData: { private: { unprovenTx: unknown } };
    try {
      callTxData = await createUnprovenCallTx(providers as never, {
        compiledContract,
        contractAddress: sdkContractAddress,
        circuitId: "verify_access",
        args: [],
      } as never) as unknown as { private: { unprovenTx: unknown } };
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.includes("CREDENTIAL_NOT_ENROLLED") || message.includes("not in allowlist")) {
        throw new Error("CREDENTIAL_NOT_ENROLLED");
      }
      throw new Error(`ACCESS_PREPARE:${message}`);
    }

    const pipeline = providers as unknown as {
      proofProvider: { proveTx: (tx: unknown) => Promise<SerializedTransaction> };
      walletProvider: { balanceTx: (tx: SerializedTransaction) => Promise<SerializedTransaction> };
    };

    let provenTx: SerializedTransaction;
    try {
      provenTx = await pipeline.proofProvider.proveTx(callTxData.private.unprovenTx);
    } catch (error) {
      throw new Error(`ACCESS_PROVE:${getErrorMessage(error)}`);
    }

    let balancedTx: SerializedTransaction;
    try {
      balancedTx = await pipeline.walletProvider.balanceTx(provenTx);
    } catch (error) {
      throw new Error(`ACCESS_BALANCE:${getErrorMessage(error)}`);
    }

    let submitResult: WalletSubmitResult;
    try {
      this.transactionSubmitContext = "access";
      submitResult = await this.submitBalancedTransaction(balancedTx, "access");
    } catch (error) {
      throw new Error(`ACCESS_SUBMIT:${getErrorMessage(error)}`);
    }
    return {
      success: submitResult.submitted,
      confirmed: submitResult.confirmed,
      txHash: submitResult.txHash ?? undefined,
      wallet: submitResult.wallet,
      status: submitResult.status,
      rawResult: submitResult.rawResult,
    };
  }

  private async readContractLedger(contractId: string): Promise<{
    admin: Uint8Array;
    valid_credentials: { findPathForLeaf: (leaf: Uint8Array) => unknown };
  } | null> {
    if (!this.session) throw new Error("WALLET_NOT_CONNECTED");
    const [{ ledger }, { ContractState }] = await Promise.all([
      import("../../public/contract/Midnight/contract/index.js"),
      import("@midnight-ntwrk/compact-runtime"),
    ]);
    const query =
      "query LatestContractState($address: HexEncoded!) { contractAction(address: $address) { state } }";
    let action: { state?: string } | null | undefined;
    for (const address of contractAddressCandidates(contractId)) {
      try {
        const data = await queryIndexer(this.session.indexerUrl, query, { address });
        action = data.contractAction as { state?: string } | null | undefined;
        if (action?.state) break;
      } catch {
        // try next address encoding
      }
    }
    if (!action?.state) return null;
    const state = ContractState.deserialize(hexToUint8Array(action.state));
    if (!state?.data) return null;
    return ledger(state.data) as {
      admin: Uint8Array;
      valid_credentials: { findPathForLeaf: (leaf: Uint8Array) => unknown };
    };
  }

  async isCredentialEnrolled(contractId: string, credentialHash: Uint8Array): Promise<boolean> {
    const hash = ensureBytes32(credentialHash);
    const contractLedger = await this.readContractLedger(contractId);
    if (!contractLedger) return false;
    return Boolean(contractLedger.valid_credentials.findPathForLeaf(hash));
  }

  async addCredential(
    secret: Uint8Array,
    contractId: string,
    onProgress?: (stage: TransactionProgressStage) => void,
  ): Promise<CredentialEnrollmentResult> {
    onProgress?.("preparing");
    const providers = await this.ensureProviders(onProgress);
    if (!this.addresses) throw new Error("WALLET_SESSION:Wallet did not return shielded addresses.");
    if (!contractId) throw new Error("GATE_NOT_CONFIGURED");
    if (secret.length !== 32) throw new Error("CREDENTIAL_FORMAT");
    const pureSecret = ensureBytes32(secret);
    const chainAddress = toChainContractAddress(contractId);

    const [{ Contract }, { CompiledContract }, { createUnprovenCallTx }] = await Promise.all([
      import("../../public/contract/Midnight/contract/index.js"),
      import("@midnight-ntwrk/compact-js"),
      import("@midnight-ntwrk/midnight-js-contracts"),
    ]);
    const caller = this.addresses.shieldedCoinPublicKey ?? this.addresses.coinPublicKey;
    if (!caller || !this.session) throw new Error("Wallet returned an invalid public key.");
    const callerBytes = ensureBytes32(await decodeCoinPublicKey(caller, this.session.networkId));

    let credentialHash: Uint8Array;
    try {
      credentialHash = ensureBytes32(await this.getCredentialHash(pureSecret));
    } catch (error) {
      throw new Error(`CREDENTIAL_HASH:${getErrorMessage(error)}`);
    }

    try {
      // After a fresh deploy, the indexer may take a few seconds to fully index the contract
      // state even though the contract address is already known. Retry for up to 30 seconds.
      let contractLedger: Awaited<ReturnType<typeof this.readContractLedger>> = null;
      const retryDeadline = Date.now() + 30000;
      while (!contractLedger && Date.now() < retryDeadline) {
        contractLedger = await this.readContractLedger(chainAddress);
        if (!contractLedger) {
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
        }
      }
      if (!contractLedger) throw new Error("Gate contract state is not available on the Midnight indexer yet. Wait a minute after deploy and try again.");
      const admin = ensureBytes32(contractLedger.admin);
      if (!bytesEqual(admin, callerBytes)) {
        throw new Error("CREDENTIAL_NOT_ADMIN");
      }
      if (contractLedger.valid_credentials.findPathForLeaf(credentialHash)) {
        return {
          success: true,
          confirmed: true,
          txId: null,
          txHash: undefined,
          credentialHash,
          alreadyEnrolled: true,
          wallet: this.walletKind(),
          status: "already_enrolled",
        };
      }
    } catch (error) {
      const message = getErrorMessage(error);
      if (message === "CREDENTIAL_NOT_ADMIN") throw error;
      throw new Error(`CREDENTIAL_CHECK:${message}`);
    }

    await this.ensureContractSigningKey(chainAddress);

    const witnesses = {
      get_secret: (context: { privateState: unknown }) => [context.privateState, pureSecret] as [unknown, Uint8Array],
      get_merkle_path: (context: { privateState: unknown }, leaf: Uint8Array) => {
        const pureLeaf = ensureBytes32(leaf);
        return [context.privateState, { leaf: pureLeaf, path: [] }] as [unknown, unknown];
      },
      get_caller: (context: { privateState: unknown }) => [context.privateState, callerBytes] as [unknown, Uint8Array],
    };
    const compiledContract = CompiledContract.make("Midnight", Contract)
      .pipe(CompiledContract.withWitnesses(witnesses), CompiledContract.withCompiledFileAssets("/contract/Midnight"));

    // Final assert: never pass 0x into createUnprovenCallTx (SDK TypeError).
    const sdkContractAddress = toChainContractAddress(chainAddress);
    providers.privateStateProvider.setContractAddress(sdkContractAddress);

    let callTxData: { private: { unprovenTx: unknown } };
    try {
      callTxData = await createUnprovenCallTx(providers as never, {
        compiledContract,
        contractAddress: sdkContractAddress,
        circuitId: "add_valid_credential",
        args: [credentialHash],
      } as never) as unknown as { private: { unprovenTx: unknown } };
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.includes("Only the gate administrator")) throw new Error("CREDENTIAL_NOT_ADMIN");
      if (message.toLowerCase().includes("no public state")) {
        throw new Error(`CREDENTIAL_PREPARE:The gate contract is not fully indexed yet. Wait a moment after deploy, reconnect the admin wallet, and retry. (${message})`);
      }
      // Surface whether we still had a prefix (should never happen after strip).
      if (/0x/i.test(message) && /prefix/i.test(message)) {
        throw new Error(
          `CREDENTIAL_PREPARE:Contract address still had a 0x prefix after normalization (sdk=${sdkContractAddress}, input=${contractId}). Hard-reload the app and retry. Original: ${message}`,
        );
      }
      throw new Error(`CREDENTIAL_PREPARE:${message}`);
    }

    // Match deploy flow: prove → balance (hex) → submit (hex).
    // Avoid submitTxAsync's Transaction.deserialize path, which hits WASM __wbg_ptr failures.
    const proofProvider = (providers as unknown as {
      proofProvider: { proveTx: (tx: unknown) => Promise<SerializedTransaction> };
      walletProvider: { balanceTx: (tx: SerializedTransaction) => Promise<SerializedTransaction> };
    });

    let provenTx: SerializedTransaction;
    try {
      provenTx = await proofProvider.proofProvider.proveTx(callTxData.private.unprovenTx);
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.includes("Only the gate administrator")) throw new Error("CREDENTIAL_NOT_ADMIN");
      throw new Error(`CREDENTIAL_PROVE:${message}`);
    }

    let balancedTx: SerializedTransaction;
    try {
      balancedTx = await proofProvider.walletProvider.balanceTx(provenTx);
    } catch (error) {
      throw new Error(`CREDENTIAL_BALANCE:${getErrorMessage(error)}`);
    }

    let submitResult: WalletSubmitResult;
    try {
      this.transactionSubmitContext = "credential";
      submitResult = await this.submitBalancedTransaction(balancedTx, "credential");
    } catch (error) {
      throw new Error(`CREDENTIAL_SUBMIT:${getErrorMessage(error)}`);
    }
    return {
      success: submitResult.submitted,
      confirmed: submitResult.confirmed,
      txId: submitResult.txHash,
      txHash: submitResult.txHash ?? undefined,
      credentialHash,
      alreadyEnrolled: false,
      wallet: submitResult.wallet,
      status: submitResult.status,
      rawResult: submitResult.rawResult,
    };
  }

  async waitForCredentialEnrollment(
    contractId: string,
    credentialHash: Uint8Array,
    timeoutMs = 120000,
  ): Promise<void> {
    if (!this.session) throw new Error("WALLET_NOT_CONNECTED");
    const hash = ensureBytes32(credentialHash);
    const deadline = Date.now() + timeoutMs;
    let lastError = "";

    while (Date.now() < deadline) {
      try {
        const contractLedger = await this.readContractLedger(contractId);
        if (contractLedger?.valid_credentials.findPathForLeaf(hash)) return;
      } catch (error) {
        lastError = getErrorMessage(error);
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }
    throw new Error(`CREDENTIAL_CONFIRM:${lastError || "The credential hash is not indexed yet."}`);
  }

  static messageFor(error: unknown): string {
    const message = getErrorMessage(error);
    const lower = message.toLowerCase();
    if (message === "NO_WALLET") return "No compatible Midnight wallet was found. Install or enable a wallet extension, then reload this page.";
    if (message === "WALLET_CONNECT_PENDING" || message === "WALLET_CONNECT_ALREADY_PENDING" || lower.includes("connection request already pending")) {
      return "Connection request already open in Lace. Approve or reject it there.";
    }
    if (message === "PREPROD_REQUIRED") return "Wrong network. This dApp only supports Midnight Preprod. Please switch your wallet to Preprod and reconnect.";
    if (message.startsWith("NETWORK_MISMATCH:")) {
      const actual = message.slice("NETWORK_MISMATCH:".length);
      return `Wrong network. This dApp only supports Midnight Preprod. Please switch your wallet${actual ? ` from ${actual}` : ""} to Preprod and reconnect.`;
    }
    if (message.startsWith("WALLET_CONNECT_FAILED:") && (lower.includes("rejected") || lower.includes("permission"))) return "Lace declined the connection request. Unlock the wallet, approve this localhost site, and try again.";
    if (message.startsWith("WALLET_CONNECT_FAILED:")) return `Lace could not connect: ${message.slice("WALLET_CONNECT_FAILED:".length)}`;
    if (message.startsWith("WALLET_PERMISSION_FAILED:")) return "Lace connected, but did not grant the permissions required to prove, balance, and submit a deployment. Approve the additional Lace permission request and retry.";
    if (message.startsWith("NETWORK_MISMATCH_CONFIG:")) {
      const actual = message.slice("NETWORK_MISMATCH_CONFIG:".length);
      if (actual === "undeployed") return "Wrong network. This dApp only supports Midnight Preprod. Please switch your wallet from the local undeployed network to Preprod and reconnect.";
      return `Wrong network. This dApp only supports Midnight Preprod. Please switch your wallet from ${actual || "the current network"} to Preprod and reconnect.`;
    }
    if (message === "WALLET_CONFIG_UNAVAILABLE") return "Unable to verify wallet network. Please ensure your wallet is connected to Midnight Preprod.";
    if (message.startsWith("WALLET_STATUS_FAILED:")) return `Lace authorized the request but did not return a valid session: ${message.slice("WALLET_STATUS_FAILED:".length)}`;
    if (message.includes("User rejected") || lower.includes("rejected")) return "The wallet request was canceled. Connect the wallet again when you are ready.";
    if (message === "CREDENTIAL_REQUIRED") return "A valid gate credential is required. Ask the gate administrator to issue access before submitting a proof.";
    if (message === "CREDENTIAL_FORMAT") return "Credentials must be exactly 32 bytes. The value stays in this browser and is never displayed after submission.";
    if (message === "CREDENTIAL_NOT_ENROLLED") return "We couldn't verify this credential. It may be incorrect, expired, revoked, or already used. Ask the gate administrator for a new credential.";
    if (message === "CREDENTIAL_NOT_ADMIN") return "Only the original administrator wallet that deployed this gate can enroll credentials. Reconnect that same wallet on the gate network and try again.";
    if (message.startsWith("ACCESS_PREPARE:")) return "We couldn't verify this credential. It may be incorrect, expired, revoked, or already used. Ask the gate administrator for a new credential.";
    if (message.startsWith("ACCESS_PROVE:")) {
      const detail = message.slice("ACCESS_PROVE:".length);
      if (detail.includes("__wbg_ptr") || lower.includes("wasm")) {
        return "Access proof generation hit a Midnight WASM binding error. Hard-reload, reconnect your wallet on the gate network, and try again.";
      }
      return "We couldn't verify this credential. It may be incorrect, expired, revoked, or already used. Ask the gate administrator for a new credential.";
    }
    if (message.startsWith("ACCESS_BALANCE:")) return "Your wallet could not prepare the access request. Check that it is connected to Preprod, then try again.";
    if (message.startsWith("ACCESS_SUBMIT:")) return "The wallet did not submit the access request. Approve the request in your wallet, then try again.";
    if (message.startsWith("CREDENTIAL_PREPARE:")) return `The credential enrollment transaction could not be prepared: ${message.slice("CREDENTIAL_PREPARE:".length)}`;
    if (message.startsWith("CREDENTIAL_PROVE:")) {
      const detail = message.slice("CREDENTIAL_PROVE:".length);
      if (detail.includes("__wbg_ptr") || lower.includes("wasm")) {
        return "Proof generation hit a Midnight WASM binding error. Hard-reload this page, reconnect the administrator wallet on the gate network, and enroll again.";
      }
      return `Proof generation for credential enrollment failed: ${detail}`;
    }
    if (message.startsWith("CREDENTIAL_BALANCE:")) return "Your wallet could not prepare the credential enrollment. Check that it is connected to Preprod, then try again.";
    if (message.startsWith("CREDENTIAL_SUBMIT:")) return "The wallet did not submit the credential enrollment. Approve the request in your wallet, then try again.";
    if (message.startsWith("CREDENTIAL_TRANSACTION:")) {
      const detail = message.slice("CREDENTIAL_TRANSACTION:".length);
      if (detail.includes("__wbg_ptr")) {
        return "Enrollment failed due to a Midnight WASM binding error after proving. Hard-reload, reconnect the admin wallet on the gate network, and retry.";
      }
      return `The credential enrollment transaction failed: ${detail}`;
    }
    if (message.startsWith("CREDENTIAL_HASH:")) return "The private credential could not be converted into its on-chain allowlist hash. Generate a new credential and retry.";
    if (message.startsWith("CREDENTIAL_CHECK:")) return `Midnight could not check whether this credential is already enrolled: ${message.slice("CREDENTIAL_CHECK:".length)}`;
    if (message.startsWith("CREDENTIAL_CONFIRM_FAILED:")) return `The credential enrollment transaction was rejected on-chain: ${message.slice("CREDENTIAL_CONFIRM_FAILED:".length)}`;
    if (message.startsWith("CREDENTIAL_CONFIRM:")) return `The credential enrollment is still pending. Do not submit it again until the Midnight indexer confirms the first transaction. (${message.slice("CREDENTIAL_CONFIRM:".length)})`;
    if (lower.includes("__wbg_ptr")) {
      return "A Midnight WASM module failed to bind (often after a hot reload). Hard-reload the page, reconnect the wallet on the gate network, and try again.";
    }
    if (message === "GATE_NOT_CONFIGURED") return "This gate has not been deployed yet. Ask the administrator to finish setup.";
    if (message === "WALLET_NOT_CONNECTED") return "Reconnect your wallet before continuing.";
    if (message.startsWith("WALLET_SESSION:")) return `The wallet is connected but the Midnight transaction session could not be prepared: ${message.slice("WALLET_SESSION:".length)}`;
    if (message === "WALLET_DISCONNECTED") return "The wallet did not keep the connection open. Unlock it, keep the extension open, and try again.";
    if (message.startsWith("DEPLOY_ZK_ASSETS:")) return `A deployment proof asset could not be loaded. Verify this URL is reachable, then retry: ${message.slice("DEPLOY_ZK_ASSETS:".length)}`;
    if (message.startsWith("DEPLOY_PROVER:")) return "The wallet could not initialize proof generation. Unlock the wallet, verify the selected Midnight network, and retry.";
    if (message.startsWith("DEPLOY_PROVIDER:")) return "Publishing could not start. Reconnect your Preprod wallet and try again.";
    if (message.startsWith("DEPLOY_KEY:")) {
      const detail = message.slice("DEPLOY_KEY:".length);
      if (detail.includes("KEY_NETWORK:")) return `The wallet returned a key for a different network. Switch to the gate network, reconnect, and retry. (${detail.slice("KEY_NETWORK:".length)})`;
      if (detail.includes("KEY_FORMAT:")) return `Lace returned an unsupported administrator key representation. ${detail.slice("KEY_FORMAT:".length)}`;
      return `The wallet administrator key could not be used for the selected network. ${detail}`;
    }
    if (message.startsWith("DEPLOY_BUILD:")) return "The gate publish request could not be prepared. Verify the wallet is connected to Preprod and retry.";
    if (message.startsWith("DEPLOY_PROVE:")) return "The private publish proof could not be generated. Reconnect your wallet and try again.";
    if (message.startsWith("DEPLOY_BALANCE:")) return "Your wallet could not prepare the publish request. Check wallet permissions and network resources, then try again.";
    if (message.startsWith("DEPLOY_CONFIRM:")) {
      return `The wallet accepted the deploy request, but the Midnight indexer never found a contract at that address. With 1AM this usually means submit failed or the node dropped the tx (history stays empty). Click "Reset & redeploy from scratch", wait 10-15 minutes, reconnect 1AM on the gate network, and deploy once. (${message.slice("DEPLOY_CONFIRM:".length)})`;
    }
    if (message.startsWith("DUST_EMPTY:")) return "The wallet is not ready to pay for the publish request. Wait for it to finish syncing or refill, then reconnect and retry.";
    if (message.startsWith("DEPLOY_SUBMIT:")) {
      const rest = message.slice("DEPLOY_SUBMIT:".length);
      const contractMatch = rest.match(/^contractId=([0-9a-f]+):(.*)/i);
      if (contractMatch) {
        const [, addr, detail] = contractMatch;
        const lowerDetail = detail.toLowerCase();
        if (lowerDetail.includes("temporarily banned") || lowerDetail.includes("temp banned")) {
          return `The network temporarily rejected this publish request. It is not confirmed on-chain. Wait 10-15 minutes, then publish once again. Do not retry repeatedly. Derived address: ${addr}.`;
        }
        if (lowerDetail.includes("no transaction id") || lowerDetail.includes("history is empty")) {
          return `1AM signed but did not return a transaction id, so the publish request may not have landed. Wait a few minutes, then restore or publish once. Derived address: ${addr}. Detail: ${detail}`;
        }
        return `The wallet reported an error after you signed. The tx may still have reached the node - use "Check deployment confirmation" once, or paste this address into "Restore published gate": ${addr}. Error detail: ${detail}`;
      }
      return `The wallet rejected the sealed deployment transaction: ${rest}`;
    }
    if (lower.includes("prover") || lower.includes("zkir") || lower.includes("verifier") || lower.includes("proof")) return `The proof setup could not be loaded: ${message}`;
    if (lower.includes("dust") || lower.includes("balance") || lower.includes("fee")) return "The wallet could not balance this deployment. Make sure the wallet is funded with the required network resources, then try again.";
    if (lower.includes("network") || lower.includes("unsupported")) return `The deployment cannot run on this wallet/network: ${message}`;
    return "The request could not be completed. Check the wallet network and try again.";
  }
}
