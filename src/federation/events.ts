/**
 * PAL-FED-0 CollaborationEvent domain (EXPERIMENTAL, §13/§19/§20/§33).
 *
 * Every event is an immutable Ordarium state subject at revision 1: the
 * adapter writes with expectedRevision 0 and never updates it. Order comes
 * from the StateChangeFeed observation order, never from the event's own
 * timestamp or key (§19).
 */

import { randomUUID } from "node:crypto";

import type { StateRef } from "@ordarium/core";

import { decodeCollaborationEvent, encodeCollaborationEvent } from "./codec.js";
import { FederationDecodeError } from "./errors.js";
import { ID_PREFIX_EVENT, ID_PREFIX_THREAD, NS_CONTRACT, NS_EVENT } from "./limits.js";
import type { PostEventInput } from "./inputs.js";
import { federationIdentity, readNamespace, type FederationStore } from "./store.js";
import { stateRefId } from "./types.js";
import type { CollaborationEvent } from "./types.js";

export interface EventContext {
  readonly fabricId: string;
  readonly selfPeer: string;
  readonly clock: () => Date;
}

export function newEventId(): string {
  return `${ID_PREFIX_EVENT}${randomUUID()}`;
}

export function newThreadId(): string {
  return `${ID_PREFIX_THREAD}${randomUUID()}`;
}

export interface PostedEvent {
  readonly event: CollaborationEvent;
  readonly revision: number;
  /** The exact durable revision reference: plmp.collab.event/<id>@1 */
  readonly ref: string;
}

/**
 * Persist one boundary delta. `from`, `createdAt` and `eventId` are injected
 * from trusted configuration here — model input supplies none of them (§32).
 */
export async function postEvent(
  store: FederationStore,
  context: EventContext,
  input: PostEventInput,
): Promise<PostedEvent> {
  const eventId = newEventId();
  const threadId = input.threadId ?? newThreadId();
  const event: CollaborationEvent = {
    schemaVersion: 1,
    eventId,
    threadId,
    from: context.selfPeer as CollaborationEvent["from"],
    to: input.to,
    kind: input.kind,
    body: input.body,
    ...(input.contractId === undefined ? {} : { contractId: input.contractId }),
    ...(input.artifacts === undefined || input.artifacts.length === 0
      ? {}
      : { artifacts: input.artifacts }),
    createdAt: context.clock().toISOString(),
  };
  const refs: StateRef[] = [];
  if (input.replyToEventId !== undefined) {
    refs.push({ kind: "state", id: stateRefId(NS_EVENT, input.replyToEventId, 1) });
  }
  if (input.contractRef !== undefined) {
    refs.push({
      kind: "state",
      id: stateRefId(NS_CONTRACT, input.contractRef.contractId, input.contractRef.revision),
    });
  }
  await store.state.write({
    namespace: NS_EVENT,
    key: eventId,
    expectedRevision: 0,
    value: encodeCollaborationEvent(event),
    ...(refs.length === 0 ? {} : { refs }),
    identity: federationIdentity(context.fabricId, `post:${eventId}`, context.selfPeer),
  });
  return { event, revision: 1, ref: stateRefId(NS_EVENT, eventId, 1) };
}

/** Decode one event state record, enforcing revision 1 and the strict shape. */
export function decodeEventRecordValue(value: unknown, key: string): CollaborationEvent {
  return decodeCollaborationEvent(value, `${NS_EVENT}/${key}`);
}

export interface StoredEvent {
  readonly event: CollaborationEvent;
  readonly key: string;
  readonly ref: string;
  /** Feed observation position is provided by array order, not stored here. */
}

/** Every event in feed order (immutable, so this is a complete view). */
export async function readAllEvents(store: FederationStore): Promise<StoredEvent[]> {
  const { records } = await readNamespace(store.state, NS_EVENT);
  return records.map((record) => {
    if (record.revision !== 1) {
      throw new FederationDecodeError(
        `${NS_EVENT}/${record.key}: immutable events must stay at revision 1 (found ${record.revision})`,
      );
    }
    return {
      event: decodeEventRecordValue(record.value, record.key),
      key: record.key,
      ref: stateRefId(NS_EVENT, record.key, record.revision),
    };
  });
}

/** Derived thread view (§18/§33): a scan, not a second store. */
export async function readThread(
  store: FederationStore,
  threadId: string,
): Promise<StoredEvent[]> {
  const all = await readAllEvents(store);
  return all.filter((entry) => entry.event.threadId === threadId);
}
