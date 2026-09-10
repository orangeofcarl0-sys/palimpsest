/**
 * PAL-FED-0 peer inbox / delivery progress (EXPERIMENTAL, §26–§30).
 *
 * Reading a batch never advances a durable cursor. `collab_inbox` persists a
 * pending batch first; only an explicit `collab_ack(batchId)` moves the
 * acknowledged cursors past it. A crash between the two replays the same
 * batch (FED-INV-7). Ordarium's StateChangeFeed is the observation clock; the
 * two streams hold separate cursors so peerstate/fabric writes can never
 * re-enter the inbox as work (§27).
 */

import { randomUUID } from "node:crypto";

import { StateRevisionConflictError, type StateRecord } from "@ordarium/core";

import {
  decodeBoundaryContract,
  decodeCollaborationEvent,
  decodePeerInboxState,
  encodePeerInboxState,
} from "./codec.js";
import { FederationAckError, FederationDecodeError } from "./errors.js";
import {
  ID_PREFIX_BATCH,
  NS_CONTRACT,
  NS_EVENT,
  NS_PEERSTATE,
  PAL_FED_SCHEMA_VERSION,
  PEERSTATE_CAS_RETRIES,
} from "./limits.js";
import type { PeerRef } from "./peers.js";
import { readNamespace, writeIdentity, type CallInvocation, type FederationStore } from "./store.js";
import { stateRefId } from "./types.js";
import type {
  BoundaryContract,
  CollaborationEvent,
  PeerInboxState,
  PendingBatch,
} from "./types.js";

export interface PeerStateContext {
  readonly fabricId: string;
  readonly selfPeer: PeerRef;
  /** Real host invocation provenance when the write came through a host tool. */
  readonly invocation?: CallInvocation | undefined;
}

export interface InboxEventItem {
  readonly event: CollaborationEvent;
  readonly ref: string;
}

export interface InboxContractItem {
  readonly contract: BoundaryContract;
  readonly revision: number;
  readonly ref: string;
}

export interface InboxResult {
  readonly peer: PeerRef;
  /** Null when the scan contained no relevant work. */
  readonly batchId: string | null;
  /** True when this is a redelivery of an already-persisted pending batch. */
  readonly replayed: boolean;
  readonly events: readonly InboxEventItem[];
  readonly contracts: readonly InboxContractItem[];
}

export interface AckResult {
  readonly batchId: string;
  /** False for an idempotent repeat of the immediately completed batch. */
  readonly changed: boolean;
}

function emptyPeerState(peer: PeerRef): PeerInboxState {
  return { schemaVersion: PAL_FED_SCHEMA_VERSION, peer };
}

async function readPeerStateRecord(
  store: FederationStore,
  peer: PeerRef,
): Promise<StateRecord | undefined> {
  return store.state.get(NS_PEERSTATE, peer);
}

function decodePeerState(record: StateRecord): PeerInboxState {
  const state = decodePeerInboxState(record.value, `${NS_PEERSTATE}/${record.key}`);
  if (state.peer !== record.key) {
    throw new FederationDecodeError(
      `${NS_PEERSTATE}/${record.key}: peer state names ${state.peer}`,
    );
  }
  return state;
}

/** Strict read of the durable peer state (operator + inbox paths). */
export async function readPeerInboxState(
  store: FederationStore,
  peer: PeerRef,
): Promise<{ readonly state: PeerInboxState; readonly revision: number }> {
  const record = await readPeerStateRecord(store, peer);
  if (record === undefined) return { state: emptyPeerState(peer), revision: 0 };
  return { state: decodePeerState(record), revision: record.revision };
}

async function writePeerState(
  store: FederationStore,
  context: PeerStateContext,
  expectedRevision: number,
  next: PeerInboxState,
): Promise<void> {
  await store.state.write({
    namespace: NS_PEERSTATE,
    key: context.selfPeer,
    expectedRevision,
    value: encodePeerInboxState(next),
    identity: writeIdentity(context, `peerstate:${context.selfPeer}`),
  });
}

/**
 * CAS loop over one peer's state subject. `mutate` is re-applied to the latest
 * durable state on conflict; each process writes only its own subject, so this
 * converges immediately in normal operation.
 */
async function casPeerState(
  store: FederationStore,
  context: PeerStateContext,
  mutate: (current: PeerInboxState) => PeerInboxState,
): Promise<PeerInboxState> {
  for (let attempt = 0; attempt < PEERSTATE_CAS_RETRIES; attempt += 1) {
    const record = await readPeerStateRecord(store, context.selfPeer);
    const current = record === undefined ? emptyPeerState(context.selfPeer) : decodePeerState(record);
    const next = mutate(current);
    try {
      await writePeerState(store, context, record?.revision ?? 0, next);
      return next;
    } catch (error) {
      if (error instanceof StateRevisionConflictError) continue;
      throw error;
    }
  }
  throw new FederationDecodeError(
    `${NS_PEERSTATE}/${context.selfPeer}: could not converge after ${PEERSTATE_CAS_RETRIES} CAS attempts`,
  );
}

function decodeEventRecord(record: StateRecord): CollaborationEvent {
  if (record.revision !== 1) {
    throw new FederationDecodeError(
      `${NS_EVENT}/${record.key}: immutable events must stay at revision 1 (found ${record.revision})`,
    );
  }
  return decodeCollaborationEvent(record.value, `${NS_EVENT}/${record.key}`);
}

function eventItem(record: StateRecord): InboxEventItem {
  return {
    event: decodeEventRecord(record),
    ref: stateRefId(NS_EVENT, record.key, record.revision),
  };
}

function contractItem(record: StateRecord): InboxContractItem {
  return {
    contract: decodeBoundaryContract(record.value, `${NS_CONTRACT}/${record.key}`),
    revision: record.revision,
    ref: stateRefId(NS_CONTRACT, record.key, record.revision),
  };
}

/**
 * Resolve a persisted pending batch back into its items. Events are immutable
 * at revision 1; contract revisions are resolved by exact (key, revision) so a
 * later revision of the same contract cannot substitute for the pending one.
 */
async function materializePending(
  store: FederationStore,
  peer: PeerRef,
  pending: PendingBatch,
): Promise<InboxResult> {
  const events = await readNamespace(store.state, NS_EVENT);
  const eventIndex = new Map(events.records.map((record) => [record.key, record]));
  const contracts = await readNamespace(store.state, NS_CONTRACT);
  const contractIndex = new Map(
    contracts.records.map((record) => [`${record.key}@${record.revision}`, record]),
  );
  const eventItems: InboxEventItem[] = [];
  for (const eventId of pending.eventIds) {
    const record = eventIndex.get(eventId);
    if (record === undefined) {
      throw new FederationDecodeError(
        `pending batch ${pending.batchId} references a missing event ${eventId}`,
      );
    }
    eventItems.push(eventItem(record));
  }
  const contractItems: InboxContractItem[] = [];
  for (const ref of pending.contractRevisions) {
    const record = contractIndex.get(`${ref.contractId}@${ref.revision}`);
    if (record === undefined) {
      throw new FederationDecodeError(
        `pending batch ${pending.batchId} references a missing contract revision ${ref.contractId}@${ref.revision}`,
      );
    }
    contractItems.push(contractItem(record));
  }
  return {
    peer,
    batchId: pending.batchId,
    replayed: true,
    events: eventItems,
    contracts: contractItems,
  };
}

/**
 * `collab_inbox`: return the existing pending batch unchanged, or scan the two
 * streams for work addressed to this peer and persist a new pending batch
 * before returning it.
 */
export async function inbox(
  store: FederationStore,
  context: PeerStateContext,
): Promise<InboxResult> {
  const { state } = await readPeerInboxState(store, context.selfPeer);
  if (state.pending !== undefined) {
    return materializePending(store, context.selfPeer, state.pending);
  }

  const eventScan = await readNamespace(store.state, NS_EVENT, state.eventCursor);
  const contractScan = await readNamespace(store.state, NS_CONTRACT, state.contractCursor);

  const relevantEvents = eventScan.records.filter(
    (record) => decodeEventRecord(record).to === context.selfPeer,
  );
  const relevantContracts = contractScan.records.filter((record) => {
    const contract = decodeBoundaryContract(record.value, `${NS_CONTRACT}/${record.key}`);
    return contract.updatedBy !== context.selfPeer;
  });

  const scannedSomething = eventScan.records.length > 0 || contractScan.records.length > 0;

  if (relevantEvents.length === 0 && relevantContracts.length === 0) {
    if (scannedSomething) {
      // Only irrelevant items: advance past them safely, without a batch (§28).
      await casPeerState(store, context, (current) => ({
        ...current,
        ...(eventScan.cursor === undefined ? {} : { eventCursor: eventScan.cursor }),
        ...(contractScan.cursor === undefined ? {} : { contractCursor: contractScan.cursor }),
      }));
    }
    return { peer: context.selfPeer, batchId: null, replayed: false, events: [], contracts: [] };
  }

  const batchId = `${ID_PREFIX_BATCH}${randomUUID()}`;
  const pending: PendingBatch = {
    batchId,
    ...(eventScan.cursor === undefined ? {} : { eventNextCursor: eventScan.cursor }),
    ...(contractScan.cursor === undefined ? {} : { contractNextCursor: contractScan.cursor }),
    eventIds: relevantEvents.map((record) => record.key),
    contractRevisions: relevantContracts.map((record) => ({
      contractId: record.key,
      revision: record.revision,
    })),
  };
  await casPeerState(store, context, (current) => ({ ...current, pending }));
  return {
    peer: context.selfPeer,
    batchId,
    replayed: false,
    events: relevantEvents.map(eventItem),
    contracts: relevantContracts.map(contractItem),
  };
}

/**
 * `collab_ack`: advance both acknowledged cursors to the pending batch's next
 * positions and clear the pending batch. A repeat of the immediately completed
 * batch is idempotent; any other batch id fails closed and moves nothing.
 */
export async function ack(
  store: FederationStore,
  context: PeerStateContext,
  batchId: string,
): Promise<AckResult> {
  for (let attempt = 0; attempt < PEERSTATE_CAS_RETRIES; attempt += 1) {
    const record = await readPeerStateRecord(store, context.selfPeer);
    const current = record === undefined ? emptyPeerState(context.selfPeer) : decodePeerState(record);
    if (current.pending?.batchId === batchId) {
      const pending = current.pending;
      const next: PeerInboxState = {
        schemaVersion: PAL_FED_SCHEMA_VERSION,
        peer: current.peer,
        ...(pending.eventNextCursor === undefined
          ? current.eventCursor === undefined
            ? {}
            : { eventCursor: current.eventCursor }
          : { eventCursor: pending.eventNextCursor }),
        ...(pending.contractNextCursor === undefined
          ? current.contractCursor === undefined
            ? {}
            : { contractCursor: current.contractCursor }
          : { contractCursor: pending.contractNextCursor }),
        lastAckedBatchId: batchId,
      };
      try {
        await writePeerState(store, context, record?.revision ?? 0, next);
        return { batchId, changed: true };
      } catch (error) {
        if (error instanceof StateRevisionConflictError) continue;
        throw error;
      }
    }
    if (current.lastAckedBatchId === batchId) {
      // FED-C04: immediate retry of the already-completed batch is a no-op.
      return { batchId, changed: false };
    }
    throw new FederationAckError(
      `collab_ack: '${batchId}' is neither the pending batch nor the last acknowledged batch; cursor unchanged`,
    );
  }
  throw new FederationDecodeError(
    `${NS_PEERSTATE}/${context.selfPeer}: ack could not converge after ${PEERSTATE_CAS_RETRIES} CAS attempts`,
  );
}
