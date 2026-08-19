import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  get_secret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  get_merkle_path(context: __compactRuntime.WitnessContext<Ledger, PS>,
                  leaf_0: Uint8Array): [PS, { leaf: Uint8Array,
                                              path: { sibling: { field: bigint },
                                                      goes_left: boolean
                                                    }[]
                                            }];
  get_caller(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  add_valid_credential(context: __compactRuntime.CircuitContext<PS>,
                       credential_hash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verify_access(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  add_valid_credential(context: __compactRuntime.CircuitContext<PS>,
                       credential_hash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verify_access(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  add_valid_credential(context: __compactRuntime.CircuitContext<PS>,
                       credential_hash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verify_access(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly admin: Uint8Array;
  valid_credentials: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined
  };
  used_nullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               admin_pk_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
