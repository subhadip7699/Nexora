/** Browser-only session markers after a successful gate proof. */

const ACCESS_PREFIX = "midnight_access:";

export type AccessSession = {
  gateId: string;
  contractId: string | null;
  txId: string | null;
  unlockedAt: number;
};

function key(gateId: string): string {
  return `${ACCESS_PREFIX}${gateId}`;
}

export function markGateUnlocked(session: AccessSession): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key(session.gateId), JSON.stringify(session));
  } catch {
    // sessionStorage may be unavailable
  }
}

export function getGateAccess(gateId: string): AccessSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key(gateId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AccessSession>;
    if (parsed.gateId !== gateId || (parsed.txId !== null && typeof parsed.txId !== "string")) return null;
    return {
      gateId: parsed.gateId,
      contractId: typeof parsed.contractId === "string" ? parsed.contractId : null,
      txId: typeof parsed.txId === "string" ? parsed.txId : null,
      unlockedAt: typeof parsed.unlockedAt === "number" ? parsed.unlockedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function clearGateAccess(gateId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key(gateId));
  } catch {
    // ignore
  }
}
