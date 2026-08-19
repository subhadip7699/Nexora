export type GateRecord = {
  id: string;
  name: string;
  description: string;
  privateContent: string;
  network: "preprod" | "undeployed";
  contractId: string | null;
  deploymentTxId: string | null;
  status: "draft" | "published";
  oneTimeProof: boolean;
  contractVersion: "credential-hash-v2";
};

const STORAGE_KEY = "midnight_gates";
const CONFIGURED_CONTRACT_ID = (process.env.NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS ?? "")
  .trim()
  .replace(/^0x/i, "")
  .toLowerCase() || null;

export const DEFAULT_GATE: GateRecord = {
  id: "genesis",
  name: "Genesis Vault",
  description: "A private launch room for approved Nexora members.",
  privateContent: "Welcome to the private launch room.\n\nMembers-only resources will appear here after verification.",
  network: "preprod",
  contractId: CONFIGURED_CONTRACT_ID,
  deploymentTxId: null,
  status: CONFIGURED_CONTRACT_ID ? "published" : "draft",
  oneTimeProof: true,
  contractVersion: "credential-hash-v2",
};

export type GateSearchParams = {
  gate?: string | null;
  contract?: string | null;
  name?: string | null;
  description?: string | null;
  network?: string | null;
};

function isGate(value: unknown): value is GateRecord {
  if (!value || typeof value !== "object") return false;
  const gate = value as Partial<GateRecord>;
  return typeof gate.id === "string" && typeof gate.name === "string" &&
    typeof gate.description === "string" &&
    (typeof gate.contractId === "string" || gate.contractId === null) &&
    gate.contractVersion === "credential-hash-v2";
}

/**
 * Normalize contract address to lowercase bare hex (no 0x).
 * Midnight JS / Compact reject a 0x prefix on contractAddress; explorer helpers re-add 0x for URLs.
 */
export function normalizeContractId(value: string): string {
  let hex = String(value ?? "").trim().replace(/^\uFEFF/, "");
  while (/^0x/i.test(hex)) {
    hex = hex.slice(2).trim();
  }
  return hex.toLowerCase();
}

/** Canonical storage / share-link form: bare hex (matches chain SDK). */
export function formatContractId(value: string): string {
  return normalizeContractId(value);
}

/** Migrate any gate records that still store `0x...` contract ids. */
function sanitizeGate(gate: GateRecord): GateRecord {
  const network: GateRecord["network"] = "preprod";
  const privateContent =
    typeof gate.privateContent === "string" && gate.privateContent.trim()
      ? gate.privateContent
      : DEFAULT_GATE.privateContent;
  if (!gate.contractId) return { ...gate, network, privateContent };
  const bare = normalizeContractId(gate.contractId);
  if (bare === gate.contractId) return { ...gate, network, privateContent };
  return { ...gate, network, privateContent, contractId: bare || null };
}

/**
 * Accept even-length hex with optional 0x.
 * Deployed addresses are commonly 32 bytes (64 hex) but can vary by encoding - keep flexible.
 */
export function isValidContractId(value: string): boolean {
  const hex = normalizeContractId(value);
  return /^[0-9a-f]{32,128}$/.test(hex) && hex.length % 2 === 0;
}

/** Stable gate id derived from contract so URL and storage stay linked. */
export function gateIdFromContract(contractId: string): string {
  const hex = normalizeContractId(contractId);
  return `gate-${hex.slice(0, 12)}`;
}

export function getGates(): GateRecord[] {
  if (typeof window === "undefined") return [DEFAULT_GATE];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    const gates = Array.isArray(parsed) ? parsed.filter(isGate).map(sanitizeGate) : [];
    if (gates.length === 0) return [DEFAULT_GATE];
    // Persist stripped ids so enroll/prove never re-read a 0x-prefixed contractId.
    try {
      const dirty = gates.some((gate, index) => {
        const raw = (Array.isArray(parsed) ? parsed : [])[index] as GateRecord | undefined;
        return Boolean(raw?.contractId && raw.contractId !== gate.contractId);
      });
      if (dirty || gates.some((g) => g.contractId?.startsWith("0x"))) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(gates));
      }
    } catch {
      // ignore storage write failures
    }
    return gates;
  } catch {
    return [DEFAULT_GATE];
  }
}

export function getGate(id = DEFAULT_GATE.id): GateRecord {
  return getGates().find((gate) => gate.id === id) ?? DEFAULT_GATE;
}

export function getGateByContractId(contractId: string): GateRecord | null {
  const target = normalizeContractId(contractId);
  if (!target) return null;
  return getGates().find((gate) => gate.contractId && normalizeContractId(gate.contractId) === target) ?? null;
}

export function saveGate(gate: GateRecord): void {
  if (typeof window === "undefined") return;
  const cleaned = sanitizeGate(gate);
  const gates = getGates().filter((item) => item.id !== cleaned.id);
  // Also drop any other record pointing at the same contract to avoid duplicates.
  const filtered = gates.filter((item) => {
    if (!item.contractId || !cleaned.contractId) return true;
    return normalizeContractId(item.contractId) !== normalizeContractId(cleaned.contractId);
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...filtered, cleaned]));
}

/**
 * Restore or attach an already-deployed on-chain gate into local storage.
 * Use after clearing browser data or switching devices.
 */
export function restorePublishedGate(input: {
  contractId: string;
  name?: string;
  description?: string;
  privateContent?: string;
  network?: GateRecord["network"];
  deploymentTxId?: string | null;
  id?: string;
}): GateRecord {
  if (!isValidContractId(input.contractId)) {
    throw new Error("INVALID_CONTRACT_ID");
  }
  const contractId = formatContractId(input.contractId);
  const existing = getGateByContractId(contractId);
  const id = input.id ?? existing?.id ?? gateIdFromContract(contractId);
  const previous = existing ?? getGate(id);

  const restored: GateRecord = {
    id,
    name: (input.name?.trim() || previous.name || DEFAULT_GATE.name).slice(0, 80),
    description: (input.description?.trim() || previous.description || DEFAULT_GATE.description).slice(0, 500),
    privateContent: (input.privateContent?.trim() || previous.privateContent || DEFAULT_GATE.privateContent).slice(0, 2000),
    network: "preprod",
    contractId,
    deploymentTxId: input.deploymentTxId ?? previous.deploymentTxId ?? null,
    status: "published",
    oneTimeProof: previous.oneTimeProof ?? true,
    contractVersion: "credential-hash-v2",
  };
  saveGate(restored);
  return restored;
}

/**
 * Resolve gate for member/admin pages from URL + localStorage.
 * Prefer URL contract param so links work without the deployer's browser storage.
 */
export function resolveGate(params: GateSearchParams = {}): GateRecord {
  const contractParam = params.contract?.trim() || null;
  const gateParam = params.gate?.trim() || null;

  if (contractParam && isValidContractId(contractParam)) {
    const contractId = formatContractId(contractParam);
    const fromStore = getGateByContractId(contractId);
    const name = params.name?.trim() || fromStore?.name || DEFAULT_GATE.name;
    const description = params.description?.trim() || fromStore?.description || DEFAULT_GATE.description;
    const network = "preprod";

    const resolved: GateRecord = {
      id: fromStore?.id ?? gateParam ?? gateIdFromContract(contractId),
      name,
      description,
      privateContent: fromStore?.privateContent || DEFAULT_GATE.privateContent,
      network,
      contractId,
      deploymentTxId: fromStore?.deploymentTxId ?? null,
      status: "published",
      oneTimeProof: fromStore?.oneTimeProof ?? true,
      contractVersion: "credential-hash-v2",
    };

    // Persist so Admin / Vault stay in sync after opening a share link.
    if (typeof window !== "undefined") {
      saveGate(resolved);
    }
    return resolved;
  }

  if (gateParam) {
    return getGate(gateParam);
  }

  return getGate(DEFAULT_GATE.id);
}

/** Member/admin share link - embeds contract when published so restore is not required. */
export function gateUrl(gate: GateRecord): string {
  const params = new URLSearchParams();
  params.set("gate", gate.id);
  if (gate.contractId) {
    params.set("contract", normalizeContractId(gate.contractId));
  }
  if (gate.name && gate.name !== DEFAULT_GATE.name) {
    params.set("name", gate.name);
  }
  if (gate.description && gate.description !== DEFAULT_GATE.description) {
    params.set("description", gate.description);
  }
  if (gate.network && gate.network !== "preprod") {
    params.set("network", gate.network);
  }
  return `/gate?${params.toString()}`;
}

export function vaultUrl(gate: GateRecord): string {
  const params = new URLSearchParams();
  params.set("gate", gate.id);
  if (gate.contractId) {
    params.set("contract", normalizeContractId(gate.contractId));
  }
  return `/vault?${params.toString()}`;
}

export function shorten(value: string | null, visible = 10): string {
  if (!value) return "Not deployed";
  if (value.length <= visible * 2) return value;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

/** Clear a failed draft gate so the operator can start a clean redeployment. */
export function resetGateToDraft(gate: GateRecord): GateRecord {
  const reset: GateRecord = {
    ...gate,
    contractId: null,
    deploymentTxId: null,
    status: "draft",
  };
  saveGate(reset);
  return reset;
}
