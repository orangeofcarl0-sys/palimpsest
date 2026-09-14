/**
 * G10-P durable peer transport envelope — the ONE typed wire shape carried by the
 * mechanical substrate. This is a TRANSPORT artifact, never a semantic event:
 *
 *   TransportTruth ≠ CollaborationTruth     StateChangeFeed Event ≠ PeerMessage
 *   TransportDelivery ≠ Commitment          AtLeastOnceDelivery ≠ DuplicateSemanticEvent
 *
 * A durable envelope carries exactly one typed operation. The inbound pump strictly
 * parses it, then hands it to the Palimpsest federation service / boundary home,
 * which own the semantic meaning. The substrate never interprets the operation.
 *
 * Every envelope has a stable `operationId` — the idempotency basis for at-least-once
 * delivery. `from` is the sender as ASSERTED BY THE ADAPTER (the local install wrote
 * its own configured local peer); it is not cryptographic unless the substrate adds
 * such a guarantee, and the local ledger is a trusted mechanical component.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier } from "../schema/identifier.js";
import type { PeerRef } from "../federation/peer.js";
import { materializePeerRef, parsePeerRef } from "../federation/peer.js";
import type { BoundaryRemoteOperation } from "../boundary_memory/index.js";
import { parseBoundaryRemoteOperation } from "../boundary_memory/index.js";

export const DURABLE_ENVELOPE_DOMAIN = "palimpsest.durable-peer-envelope.v1";
export const TRANSPORT_NAMESPACE_PREFIX = "palimpsest.peer-transport";

export class DurableEnvelopeError extends Error {
  constructor(
    readonly kind:
      | "malformed_envelope"
      | "unknown_schema_version"
      | "unknown_operation"
      | "unknown_field"
      | "invalid_identifier",
    message: string,
  ) {
    super(message);
    this.name = "DurableEnvelopeError";
  }
}

/** The typed operations a durable envelope may carry. */
export type DurablePeerOperation =
  | { readonly kind: "peer_message"; readonly threadId: string; readonly body: string }
  | { readonly kind: "commitment_accept"; readonly commitmentId: string }
  | { readonly kind: "commitment_reject"; readonly commitmentId: string }
  | { readonly kind: "commitment_release"; readonly commitmentId: string }
  | { readonly kind: "boundary"; readonly workspaceId: string; readonly operation: BoundaryRemoteOperation };

export interface DurablePeerEnvelope {
  readonly schemaVersion: 1;
  /** Stable idempotency basis; redelivery of the same operationId must not duplicate semantics. */
  readonly operationId: string;
  /** Sender identity as asserted by the adapter — never caller-supplied. */
  readonly from: PeerRef;
  readonly to: PeerRef;
  /** Wire timestamp (mechanical only; never semantic ordering). */
  readonly sentAt: string;
  readonly operation: DurablePeerOperation;
}

function fail(kind: DurableEnvelopeError["kind"], message: string): never {
  throw new DurableEnvelopeError(kind, message);
}

function asObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("malformed_envelope", `${what} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function exactKeys(object: Record<string, unknown>, expected: readonly string[], what: string): void {
  const keys = Object.keys(object);
  for (const key of keys) {
    if (!expected.includes(key)) fail("unknown_field", `${what} has unknown field "${key}"`);
  }
  for (const key of expected) {
    if (!(key in object)) fail("malformed_envelope", `${what} is missing field "${key}"`);
  }
}

function stableId(value: unknown, what: string): string {
  if (typeof value !== "string" || !isStableIdentifier(value)) {
    fail("invalid_identifier", `${what} must be a stable identifier`);
  }
  return value;
}

function nonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail("malformed_envelope", `${what} must be a non-empty string`);
  }
  return value;
}

const OPERATION_KINDS = [
  "peer_message",
  "commitment_accept",
  "commitment_reject",
  "commitment_release",
  "boundary",
] as const;

export function parseDurablePeerOperation(raw: unknown, what = "operation"): DurablePeerOperation {
  const object = asObject(raw, what);
  const kind = object.kind;
  if (typeof kind !== "string" || !(OPERATION_KINDS as readonly string[]).includes(kind)) {
    fail("unknown_operation", `${what}.kind must be one of ${OPERATION_KINDS.join(" | ")}`);
  }
  switch (kind as DurablePeerOperation["kind"]) {
    case "peer_message": {
      exactKeys(object, ["kind", "threadId", "body"], what);
      return Object.freeze({
        kind: "peer_message",
        threadId: stableId(object.threadId, `${what}.threadId`),
        body: nonEmpty(object.body, `${what}.body`),
      });
    }
    case "commitment_accept":
    case "commitment_reject":
    case "commitment_release": {
      exactKeys(object, ["kind", "commitmentId"], what);
      return Object.freeze({ kind, commitmentId: stableId(object.commitmentId, `${what}.commitmentId`) }) as DurablePeerOperation;
    }
    case "boundary": {
      exactKeys(object, ["kind", "workspaceId", "operation"], what);
      return Object.freeze({
        kind: "boundary",
        workspaceId: stableId(object.workspaceId, `${what}.workspaceId`),
        operation: parseBoundaryRemoteOperation(object.operation, `${what}.operation`),
      });
    }
  }
}

export function parseDurablePeerEnvelope(raw: unknown, what = "DurablePeerEnvelope"): DurablePeerEnvelope {
  const object = asObject(raw, what);
  exactKeys(object, ["schemaVersion", "operationId", "from", "to", "sentAt", "operation"], what);
  if (object.schemaVersion !== 1) {
    fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    operationId: stableId(object.operationId, `${what}.operationId`),
    from: parsePeerRef(object.from),
    to: parsePeerRef(object.to),
    sentAt: nonEmpty(object.sentAt, `${what}.sentAt`),
    operation: parseDurablePeerOperation(object.operation, `${what}.operation`),
  });
}

export function materializeDurablePeerEnvelope(input: {
  readonly operationId: string;
  readonly from: PeerRef;
  readonly to: PeerRef;
  readonly sentAt: string;
  readonly operation: DurablePeerOperation;
}): DurablePeerEnvelope {
  return Object.freeze({
    schemaVersion: 1 as const,
    operationId: stableId(input.operationId, "operationId"),
    from: materializePeerRef({ peerId: input.from.peerId }),
    to: materializePeerRef({ peerId: input.to.peerId }),
    sentAt: nonEmpty(input.sentAt, "sentAt"),
    operation: input.operation,
  });
}

/** Full content digest of a validated envelope (includes the mechanical wire timestamp). */
export function durableEnvelopeDigestOf(envelope: DurablePeerEnvelope): string {
  return canonicalDigest({ domain: DURABLE_ENVELOPE_DOMAIN, envelope });
}

/**
 * The idempotency identity of an envelope: `operationId` + endpoints + operation
 * content, EXCLUDING the wire timestamp. A retry of the same semantic operation must be
 * idempotent even though `sentAt` differs — the timestamp is mechanical, never identity.
 */
export function durableOperationDigestOf(envelope: DurablePeerEnvelope): string {
  return canonicalDigest({
    domain: DURABLE_ENVELOPE_DOMAIN,
    operationId: envelope.operationId,
    from: envelope.from,
    to: envelope.to,
    operation: envelope.operation,
  });
}

/** The per-peer mailbox namespace inside the shared transport substrate. */
export function mailboxNamespace(transportNamespace: string, peerId: string): string {
  return `${TRANSPORT_NAMESPACE_PREFIX}.${stableId(transportNamespace, "transportNamespace")}.${stableId(peerId, "peerId")}`;
}
