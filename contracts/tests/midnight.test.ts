/**
 * Behavioral mock tests for Midnight access rules.
 *
 * These tests mirror the *intended* logic of `midnight.compact`
 * (allowlist membership + nullifier replay protection + admin-only enroll)
 * using in-memory Sets. They are NOT Compact/testkit circuit proofs and do
 * not exercise the ZK prover or on-chain WASM runtime.
 *
 * For Level 3 credibility: label clearly; prefer real Compact tests when the
 * toolchain is available (`npm run compile` + testkit).
 */
import { describe, expect, it, beforeEach } from '@jest/globals';

/** Domain tags aligned with midnight.compact pad/hash prefixes (conceptual). */
const DOMAIN = {
  credential: 'vault:credential',
  nullifier: 'vault:nullifier',
} as const;

type MockLedger = {
  admin: string;
  validCredentials: Set<string>;
  usedNullifiers: Set<string>;
};

function createLedger(adminPk: string): MockLedger {
  return {
    admin: adminPk,
    validCredentials: new Set(),
    usedNullifiers: new Set(),
  };
}

/** Simulates add_valid_credential admin check + leaf insert. */
function addValidCredential(
  ledger: MockLedger,
  caller: string,
  credentialHash: string,
): void {
  if (caller !== ledger.admin) {
    throw new Error('Only the gate administrator can add credentials');
  }
  ledger.validCredentials.add(credentialHash);
}

/**
 * Simulates verify_access: membership in allowlist + fresh nullifier.
 * Real circuit derives leaf/nullifier via persistentHash; here we pass pre-derived ids.
 */
function verifyAccess(
  ledger: MockLedger,
  credentialHash: string,
  nullifier: string,
): void {
  if (!ledger.validCredentials.has(credentialHash)) {
    throw new Error('Invalid credential: not in allowlist');
  }
  if (ledger.usedNullifiers.has(nullifier)) {
    throw new Error('Access denied: nullifier already used');
  }
  ledger.usedNullifiers.add(nullifier);
}

describe('Midnight access rules (behavioral mock)', () => {
  const adminPk = 'admin_pk_bytes32_mock';
  let ledger: MockLedger;

  beforeEach(() => {
    ledger = createLedger(adminPk);
  });

  it('initializes with a configured admin identity', () => {
    expect(ledger.admin).toBe(adminPk);
    expect(ledger.validCredentials.size).toBe(0);
    expect(ledger.usedNullifiers.size).toBe(0);
  });

  it('allows only the admin caller to enroll a credential hash', () => {
    const cred = `${DOMAIN.credential}:member_a_hash`;
    addValidCredential(ledger, adminPk, cred);
    expect(ledger.validCredentials.has(cred)).toBe(true);

    expect(() =>
      addValidCredential(ledger, 'not_the_admin', `${DOMAIN.credential}:rogue`),
    ).toThrow(/Only the gate administrator/);
    expect(ledger.validCredentials.has(`${DOMAIN.credential}:rogue`)).toBe(false);
  });

  it('accepts verify_access for an enrolled credential with a fresh nullifier', () => {
    const cred = `${DOMAIN.credential}:member_b_hash`;
    const nullifier = `${DOMAIN.nullifier}:member_b_once`;
    addValidCredential(ledger, adminPk, cred);

    expect(() => verifyAccess(ledger, cred, nullifier)).not.toThrow();
    expect(ledger.usedNullifiers.has(nullifier)).toBe(true);
  });

  it('rejects verify_access when the credential is not on the allowlist', () => {
    const invalidCred = `${DOMAIN.credential}:not_enrolled`;
    const nullifier = `${DOMAIN.nullifier}:unused`;

    expect(() => verifyAccess(ledger, invalidCred, nullifier)).toThrow(
      /not in allowlist/,
    );
    expect(ledger.usedNullifiers.has(nullifier)).toBe(false);
  });

  it('rejects a second prove with the same nullifier (replay protection)', () => {
    const cred = `${DOMAIN.credential}:member_c_hash`;
    const nullifier = `${DOMAIN.nullifier}:member_c_once`;
    addValidCredential(ledger, adminPk, cred);
    verifyAccess(ledger, cred, nullifier);

    expect(() => verifyAccess(ledger, cred, nullifier)).toThrow(
      /nullifier already used/,
    );
  });
});
