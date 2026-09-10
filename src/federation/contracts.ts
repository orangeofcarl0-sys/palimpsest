/**
 * PAL-FED-0 BoundaryContract domain (EXPERIMENTAL, §21–§25/§34/§53).
 *
 * A contract is a revisioned Ordarium state subject. Agreement is never
 * inferred from conversation: only an explicit `accept` transition bound to
 * the exact current terms digest can make status `agreed` (FED-INV-4/5), and
 * any terms change clears prior acceptances (FED-INV-6).
 */

import { randomUUID } from "node:crypto";

import { StateRevisionConflictError, type StateRef, type StateRecord } from "@ordarium/core";

import {
  decodeBoundaryContract,
  encodeBoundaryContract,
  termsDigestOf,
} from "./codec.js";
import {
  FederationConflictError,
  FederationNotFoundError,
  StaleTermsDigestError,
} from "./errors.js";
import type { AcceptContractInput, ProposeContractInput } from "./inputs.js";
import { ID_PREFIX_CONTRACT, NS_CONTRACT, NS_EVENT } from "./limits.js";
import { FIXED_PEERS, type PeerRef } from "./peers.js";
import { readNamespace, writeIdentity, type CallInvocation, type FederationStore } from "./store.js";
import { stateRefId } from "./types.js";
import type { BoundaryContract, ContractAcceptance, ContractTerms } from "./types.js";

export interface ContractContext {
  readonly fabricId: string;
  readonly selfPeer: PeerRef;
  readonly clock: () => Date;
  /** Real host invocation provenance when the write came through a host tool. */
  readonly invocation?: CallInvocation | undefined;
}

export function newContractId(): string {
  return `${ID_PREFIX_CONTRACT}${randomUUID()}`;
}

export interface ContractView {
  readonly contract: BoundaryContract;
  readonly revision: number;
  /** The exact durable revision reference. */
  readonly ref: string;
  readonly created: boolean;
}

export interface ContractMutation extends ContractView {
  /** False when an idempotent accept produced no new revision. */
  readonly changed: boolean;
}

function decodeRecord(record: StateRecord): BoundaryContract {
  return decodeBoundaryContract(record.value, `${NS_CONTRACT}/${record.key}`);
}

async function readCurrent(
  store: FederationStore,
  contractId: string,
): Promise<StateRecord | undefined> {
  return store.state.get(NS_CONTRACT, contractId);
}

/**
 * Propose complete terms at expectedRevision (0 creates). The caller supplies
 * the full next terms — no patch-merge ambiguity (v0) — and prior acceptances
 * are always cleared, so no stale agreement can survive a terms change.
 */
export async function proposeContract(
  store: FederationStore,
  context: ContractContext,
  input: ProposeContractInput,
): Promise<ContractMutation> {
  const current = await readCurrent(store, input.contractId);
  if (input.expectedRevision === 0) {
    if (current !== undefined) {
      throw new FederationConflictError(
        `${NS_CONTRACT}/${input.contractId}: already exists at revision ${current.revision}; propose with that expectedRevision`,
        current.revision,
      );
    }
  } else if (current === undefined) {
    throw new FederationNotFoundError(
      `${NS_CONTRACT}/${input.contractId}: no such contract to revise`,
    );
  } else if (current.revision !== input.expectedRevision) {
    throw new FederationConflictError(
      `${NS_CONTRACT}/${input.contractId}: is at revision ${current.revision}; expected ${input.expectedRevision}`,
      current.revision,
    );
  }

  const terms: ContractTerms = input.terms;
  const contract: BoundaryContract = {
    schemaVersion: 1,
    contractId: input.contractId,
    participants: [...FIXED_PEERS],
    title: input.title,
    terms,
    termsDigest: termsDigestOf(terms),
    proposedBy: context.selfPeer,
    acceptedBy: [],
    status: "draft",
    updatedBy: context.selfPeer,
    updatedAt: context.clock().toISOString(),
  };
  const refs: StateRef[] = (input.basisEventIds ?? []).map((eventId) => ({
    kind: "state" as const,
    id: stateRefId(NS_EVENT, eventId, 1),
  }));
  try {
    await store.state.write({
      namespace: NS_CONTRACT,
      key: input.contractId,
      expectedRevision: input.expectedRevision,
      value: encodeBoundaryContract(contract),
      ...(refs.length === 0 ? {} : { refs }),
      identity: writeIdentity(context, `contract-propose:${input.contractId}`),
    });
  } catch (error) {
    if (error instanceof StateRevisionConflictError) {
      const latest = await readCurrent(store, input.contractId);
      throw new FederationConflictError(
        `${NS_CONTRACT}/${input.contractId}: concurrent proposal lost the CAS`,
        latest?.revision,
      );
    }
    throw error;
  }
  return {
    contract,
    revision: input.expectedRevision + 1,
    ref: stateRefId(NS_CONTRACT, input.contractId, input.expectedRevision + 1),
    created: input.expectedRevision === 0,
    changed: true,
  };
}

/**
 * Accept the exact current terms digest as the configured self peer. The
 * caller cannot name another accepting peer, and an already-recorded
 * acceptance of the same digest is an idempotent no-op rather than a
 * meaningless revision.
 */
export async function acceptContract(
  store: FederationStore,
  context: ContractContext,
  input: AcceptContractInput,
): Promise<ContractMutation> {
  const current = await readCurrent(store, input.contractId);
  if (current === undefined) {
    throw new FederationNotFoundError(
      `${NS_CONTRACT}/${input.contractId}: no such contract to accept`,
    );
  }
  if (current.revision !== input.expectedRevision) {
    throw new FederationConflictError(
      `${NS_CONTRACT}/${input.contractId}: is at revision ${current.revision}; expected ${input.expectedRevision}`,
      current.revision,
    );
  }
  const contract = decodeRecord(current);
  if (contract.termsDigest !== input.expectedTermsDigest) {
    throw new StaleTermsDigestError(
      `${NS_CONTRACT}/${input.contractId}: digest ${input.expectedTermsDigest} is not current (${contract.termsDigest}); re-read the contract`,
    );
  }
  const self = context.selfPeer;
  const alreadyAccepted = contract.acceptedBy.some(
    (acceptance) => acceptance.peer === self && acceptance.termsDigest === input.expectedTermsDigest,
  );
  if (alreadyAccepted) {
    return {
      contract,
      revision: current.revision,
      ref: stateRefId(NS_CONTRACT, input.contractId, current.revision),
      created: false,
      changed: false,
    };
  }
  const acceptedAt = context.clock().toISOString();
  const acceptedBy: ContractAcceptance[] = [
    ...contract.acceptedBy,
    { peer: self, termsDigest: contract.termsDigest, acceptedAt },
  ];
  const agreed = FIXED_PEERS.every((peer) =>
    acceptedBy.some((acceptance) => acceptance.peer === peer),
  );
  const next: BoundaryContract = {
    ...contract,
    acceptedBy,
    status: agreed ? "agreed" : "draft",
    updatedBy: self,
    updatedAt: acceptedAt,
  };
  try {
    await store.state.write({
      namespace: NS_CONTRACT,
      key: input.contractId,
      expectedRevision: input.expectedRevision,
      value: encodeBoundaryContract(next),
      identity: writeIdentity(context, `contract-accept:${input.contractId}`),
    });
  } catch (error) {
    if (error instanceof StateRevisionConflictError) {
      const latest = await readCurrent(store, input.contractId);
      throw new FederationConflictError(
        `${NS_CONTRACT}/${input.contractId}: concurrent change lost the CAS`,
        latest?.revision,
      );
    }
    throw error;
  }
  return {
    contract: next,
    revision: input.expectedRevision + 1,
    ref: stateRefId(NS_CONTRACT, input.contractId, input.expectedRevision + 1),
    created: false,
    changed: true,
  };
}

export interface ContractReadResult {
  readonly contract: BoundaryContract;
  readonly revision: number;
  readonly ref: string;
  /** Bounded revision history (oldest -> newest) when requested (§34). */
  readonly history?: readonly { readonly revision: number; readonly contract: BoundaryContract }[];
}

export async function getContract(
  store: FederationStore,
  contractId: string,
  options: { readonly history?: boolean } = {},
): Promise<ContractReadResult> {
  const current = await readCurrent(store, contractId);
  if (current === undefined) {
    throw new FederationNotFoundError(`${NS_CONTRACT}/${contractId}: no such contract`);
  }
  const contract = decodeRecord(current);
  const result: ContractReadResult = {
    contract,
    revision: current.revision,
    ref: stateRefId(NS_CONTRACT, contractId, current.revision),
  };
  if (options.history !== true) return result;
  const page = await store.state.history(NS_CONTRACT, contractId, undefined, 100);
  return {
    ...result,
    history: page.revisions.map((record) => ({
      revision: record.revision,
      contract: decodeRecord(record),
    })),
  };
}

/** All contract revisions in feed order (operator/inbox view). */
export async function readAllContractRecords(store: FederationStore): Promise<StateRecord[]> {
  const { records } = await readNamespace(store.state, NS_CONTRACT);
  return records;
}
