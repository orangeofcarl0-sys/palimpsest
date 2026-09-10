/**
 * PAL-FED-0 canonical strict codec (EXPERIMENTAL, §35).
 *
 * Every durable record read from the coordination DB passes through exactly
 * one decoder here before it is trusted. The decoders are exact-envelope:
 * unknown durable fields are rejected, tagged unions are closed, strings and
 * arrays are bounded, and peer identities/IDs/digests are shape-checked. There
 * is no `as CollaborationEvent` at a durable boundary anywhere in this module.
 *
 * Encoders are the write-side twin of the decoders and emit the exact key set
 * the decoders accept (optional fields omitted, never null).
 */

import { canonicalDigest, type JsonObject, type JsonValue } from "../schema/canonical.js";
import {
  ARTIFACTS_MAX,
  ARTIFACT_DIGEST_MAX_CHARS,
  ARTIFACT_LABEL_MAX_CHARS,
  ARTIFACT_LOCATOR_MAX_CHARS,
  CONTRACT_TERM_MAX_CHARS,
  CONTRACT_TERM_MAX_ITEMS,
  CONTRACT_TERM_MIN_CHARS,
  CONTRACT_TERMS_LISTS,
  CONTRACT_TITLE_MAX_CHARS,
  CONTRACT_TITLE_MIN_CHARS,
  EVENT_BODY_MAX_CHARS,
  EVENT_BODY_MIN_CHARS,
  FABRIC_ID_MAX_CHARS,
  ID_MAX_CHARS,
  PAL_FED_PROTOCOL,
  PAL_FED_SCHEMA_VERSION,
} from "./limits.js";
import { FederationDecodeError } from "./errors.js";
import { FIXED_PEERS, isFixedPeerSet, isPeerRef, type PeerRef } from "./peers.js";import {
  ARTIFACT_KINDS,
  EVENT_KINDS,
  type ArtifactKind,
  type ArtifactRef,
  type BoundaryContract,
  type CollaborationEvent,
  type ContractAcceptance,
  type ContractTerms,
  type EventKind,
  type FederationFabricMarker,
  type PeerInboxState,
  type PendingBatch,
} from "./types.js";

const HEX_DIGEST = /^[0-9a-f]{64}$/;
const PENDING_ITEMS_MAX = 4_096;

type UnknownObject = { readonly [key: string]: unknown };

function asObject(value: unknown, path: string): UnknownObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FederationDecodeError(`${path}: expected an object`);
  }
  return value as UnknownObject;
}

function exactKeys(object: UnknownObject, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      throw new FederationDecodeError(`${path}: unknown field '${key}'`);
    }
  }
}

function required(object: UnknownObject, key: string, path: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    throw new FederationDecodeError(`${path}.${key}: required field is missing`);
  }
  return object[key];
}

function optional(object: UnknownObject, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
}

function asString(value: unknown, path: string, min: number, max: number): string {
  if (typeof value !== "string") {
    throw new FederationDecodeError(`${path}: expected a string`);
  }
  if (value.length < min || value.length > max) {
    throw new FederationDecodeError(
      `${path}: length ${value.length} is outside [${min}, ${max}]`,
    );
  }
  return value;
}

function optionalString(
  object: UnknownObject,
  key: string,
  path: string,
  min: number,
  max: number,
): string | undefined {
  const value = optional(object, key);
  if (value === undefined) return undefined;
  return asString(value, `${path}.${key}`, min, max);
}

function asBoundedString(
  value: unknown,
  path: string,
  min: number,
  max: number,
): string {
  return asString(value, path, min, max);
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new FederationDecodeError(
      `${path}: expected one of ${allowed.join(" | ")}, got '${String(value)}'`,
    );
  }
  return value as T;
}

function asArray(value: unknown, path: string, maxItems: number): unknown[] {
  if (!Array.isArray(value)) {
    throw new FederationDecodeError(`${path}: expected an array`);
  }
  if (value.length > maxItems) {
    throw new FederationDecodeError(`${path}: has ${value.length} items, limit is ${maxItems}`);
  }
  return value;
}

function asTimestamp(value: unknown, path: string): string {
  const text = asString(value, path, 1, 64);
  if (Number.isNaN(Date.parse(text))) {
    throw new FederationDecodeError(`${path}: '${text}' is not a parseable timestamp`);
  }
  return text;
}

function asPositiveRevision(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new FederationDecodeError(`${path}: expected a positive safe integer`);
  }
  return value;
}

function asDigest(value: unknown, path: string): string {
  const text = asString(value, path, 64, 64);
  if (!HEX_DIGEST.test(text)) {
    throw new FederationDecodeError(`${path}: expected a lowercase SHA-256 hex digest`);
  }
  return text;
}

function asPeer(value: unknown, path: string): PeerRef {
  if (!isPeerRef(value)) {
    throw new FederationDecodeError(
      `${path}: '${String(value)}' is not a PAL-FED-0 peer`,
    );
  }
  return value;
}

function decodeTerms(value: unknown, path: string): ContractTerms {
  const object = asObject(value, path);
  exactKeys(object, CONTRACT_TERMS_LISTS, path);
  const lists = {} as Record<(typeof CONTRACT_TERMS_LISTS)[number], string[]>;
  for (const list of CONTRACT_TERMS_LISTS) {
    const raw = asArray(required(object, list, path), `${path}.${list}`, CONTRACT_TERM_MAX_ITEMS);
    lists[list] = raw.map((item, index) =>
      asBoundedString(
        item,
        `${path}.${list}[${index}]`,
        CONTRACT_TERM_MIN_CHARS,
        CONTRACT_TERM_MAX_CHARS,
      ),
    );
  }
  return {
    requirements: lists.requirements,
    constraints: lists.constraints,
    interfaceNotes: lists.interfaceNotes,
    acceptanceCriteria: lists.acceptanceCriteria,
    openQuestions: lists.openQuestions,
  };
}

function decodeArtifact(value: unknown, path: string): ArtifactRef {
  const object = asObject(value, path);
  exactKeys(object, ["kind", "locator", "label", "digest"], path);
  const kind = asEnum<ArtifactKind>(required(object, "kind", path), ARTIFACT_KINDS, `${path}.kind`);
  const locator = asString(
    required(object, "locator", path),
    `${path}.locator`,
    1,
    ARTIFACT_LOCATOR_MAX_CHARS,
  );
  const label = optionalString(object, "label", path, 1, ARTIFACT_LABEL_MAX_CHARS);
  const digest = optionalString(object, "digest", path, 1, ARTIFACT_DIGEST_MAX_CHARS);
  return {
    kind,
    locator,
    ...(label === undefined ? {} : { label }),
    ...(digest === undefined ? {} : { digest }),
  };
}

export function decodeArtifactRefs(value: unknown, path: string): ArtifactRef[] {
  const raw = asArray(value, path, ARTIFACTS_MAX);
  return raw.map((item, index) => decodeArtifact(item, `${path}[${index}]`));
}

// --- Fabric marker ---------------------------------------------------------------

export function decodeFabricMarker(value: unknown, path = "fabric"): FederationFabricMarker {
  const object = asObject(value, path);
  exactKeys(object, ["schemaVersion", "protocol", "fabricId", "peers", "createdAt"], path);
  const schemaVersion = asPositiveRevision(required(object, "schemaVersion", path), `${path}.schemaVersion`);
  if (schemaVersion !== PAL_FED_SCHEMA_VERSION) {
    throw new FederationDecodeError(`${path}.schemaVersion: expected ${PAL_FED_SCHEMA_VERSION}`);
  }
  const protocol = asString(required(object, "protocol", path), `${path}.protocol`, 1, 64);
  if (protocol !== PAL_FED_PROTOCOL) {
    throw new FederationDecodeError(`${path}.protocol: expected '${PAL_FED_PROTOCOL}'`);
  }
  const fabricId = asString(required(object, "fabricId", path), `${path}.fabricId`, 1, FABRIC_ID_MAX_CHARS);
  const rawPeers = asArray(required(object, "peers", path), `${path}.peers`, FIXED_PEERS.length).map(
    (peer, index) => asPeer(peer, `${path}.peers[${index}]`),
  );
  if (!isFixedPeerSet(rawPeers)) {
    throw new FederationDecodeError(
      `${path}.peers: expected exactly ${FIXED_PEERS.join(", ")}`,
    );
  }
  const createdAt = asTimestamp(required(object, "createdAt", path), `${path}.createdAt`);
  return {
    schemaVersion: PAL_FED_SCHEMA_VERSION,
    protocol: PAL_FED_PROTOCOL,
    fabricId,
    peers: [...FIXED_PEERS],
    createdAt,
  };
}

export function encodeFabricMarker(marker: FederationFabricMarker): JsonObject {
  return {
    schemaVersion: marker.schemaVersion,
    protocol: marker.protocol,
    fabricId: marker.fabricId,
    peers: [...marker.peers],
    createdAt: marker.createdAt,
  };
}

// --- CollaborationEvent ----------------------------------------------------------

const EVENT_KEYS = [
  "schemaVersion",
  "eventId",
  "threadId",
  "from",
  "to",
  "kind",
  "body",
  "contractId",
  "artifacts",
  "createdAt",
] as const;

export function decodeCollaborationEvent(
  value: unknown,
  path = "event",
): CollaborationEvent {
  const object = asObject(value, path);
  exactKeys(object, EVENT_KEYS, path);
  const schemaVersion = asPositiveRevision(required(object, "schemaVersion", path), `${path}.schemaVersion`);
  if (schemaVersion !== PAL_FED_SCHEMA_VERSION) {
    throw new FederationDecodeError(`${path}.schemaVersion: expected ${PAL_FED_SCHEMA_VERSION}`);
  }
  const eventId = asString(required(object, "eventId", path), `${path}.eventId`, 1, ID_MAX_CHARS);
  const threadId = asString(required(object, "threadId", path), `${path}.threadId`, 1, ID_MAX_CHARS);
  const from = asPeer(required(object, "from", path), `${path}.from`);
  const to = asPeer(required(object, "to", path), `${path}.to`);
  if (from === to) {
    throw new FederationDecodeError(`${path}: an event cannot be addressed from and to ${from}`);
  }
  const kind = asEnum<EventKind>(required(object, "kind", path), EVENT_KINDS, `${path}.kind`);
  const body = asString(required(object, "body", path), `${path}.body`, EVENT_BODY_MIN_CHARS, EVENT_BODY_MAX_CHARS);
  const contractId = optionalString(object, "contractId", path, 1, ID_MAX_CHARS);
  const artifactsRaw = optional(object, "artifacts");
  const artifacts =
    artifactsRaw === undefined ? undefined : decodeArtifactRefs(artifactsRaw, `${path}.artifacts`);
  const createdAt = asTimestamp(required(object, "createdAt", path), `${path}.createdAt`);
  return {
    schemaVersion: PAL_FED_SCHEMA_VERSION,
    eventId,
    threadId,
    from,
    to,
    kind,
    body,
    ...(contractId === undefined ? {} : { contractId }),
    ...(artifacts === undefined ? {} : { artifacts }),
    createdAt,
  };
}

export function encodeCollaborationEvent(event: CollaborationEvent): JsonObject {
  return {
    schemaVersion: event.schemaVersion,
    eventId: event.eventId,
    threadId: event.threadId,
    from: event.from,
    to: event.to,
    kind: event.kind,
    body: event.body,
    ...(event.contractId === undefined ? {} : { contractId: event.contractId }),
    ...(event.artifacts === undefined
      ? {}
      : {
          artifacts: event.artifacts.map((artifact) => ({
            kind: artifact.kind,
            locator: artifact.locator,
            ...(artifact.label === undefined ? {} : { label: artifact.label }),
            ...(artifact.digest === undefined ? {} : { digest: artifact.digest }),
          })),
        }),
    createdAt: event.createdAt,
  };
}

// --- Contract terms + digest -----------------------------------------------------

export function encodeTerms(terms: ContractTerms): JsonObject {
  return {
    requirements: [...terms.requirements],
    constraints: [...terms.constraints],
    interfaceNotes: [...terms.interfaceNotes],
    acceptanceCriteria: [...terms.acceptanceCriteria],
    openQuestions: [...terms.openQuestions],
  };
}

/** The single canonical terms digest (FED-INV-5 binding). */
export function termsDigestOf(terms: ContractTerms): string {
  return canonicalDigest(encodeTerms(terms));
}

export function decodeContractTerms(value: unknown, path = "terms"): ContractTerms {
  return decodeTerms(value, path);
}

// --- BoundaryContract ------------------------------------------------------------

const CONTRACT_KEYS = [
  "schemaVersion",
  "contractId",
  "participants",
  "title",
  "terms",
  "termsDigest",
  "proposedBy",
  "acceptedBy",
  "status",
  "updatedBy",
  "updatedAt",
] as const;

function decodeAcceptance(value: unknown, path: string): ContractAcceptance {
  const object = asObject(value, path);
  exactKeys(object, ["peer", "termsDigest", "acceptedAt"], path);
  return {
    peer: asPeer(required(object, "peer", path), `${path}.peer`),
    termsDigest: asDigest(required(object, "termsDigest", path), `${path}.termsDigest`),
    acceptedAt: asTimestamp(required(object, "acceptedAt", path), `${path}.acceptedAt`),
  };
}

export function decodeBoundaryContract(value: unknown, path = "contract"): BoundaryContract {
  const object = asObject(value, path);
  exactKeys(object, CONTRACT_KEYS, path);
  const schemaVersion = asPositiveRevision(required(object, "schemaVersion", path), `${path}.schemaVersion`);
  if (schemaVersion !== PAL_FED_SCHEMA_VERSION) {
    throw new FederationDecodeError(`${path}.schemaVersion: expected ${PAL_FED_SCHEMA_VERSION}`);
  }
  const contractId = asString(required(object, "contractId", path), `${path}.contractId`, 1, ID_MAX_CHARS);
  const participants = asArray(
    required(object, "participants", path),
    `${path}.participants`,
    FIXED_PEERS.length,
  ).map((peer, index) => asPeer(peer, `${path}.participants[${index}]`));
  if (!isFixedPeerSet(participants) || new Set(participants).size !== FIXED_PEERS.length) {
    throw new FederationDecodeError(
      `${path}.participants: expected exactly ${FIXED_PEERS.join(", ")}`,
    );
  }
  const title = asString(
    required(object, "title", path),
    `${path}.title`,
    CONTRACT_TITLE_MIN_CHARS,
    CONTRACT_TITLE_MAX_CHARS,
  );
  const terms = decodeTerms(required(object, "terms", path), `${path}.terms`);
  const termsDigest = asDigest(required(object, "termsDigest", path), `${path}.termsDigest`);
  const recomputed = termsDigestOf(terms);
  if (recomputed !== termsDigest) {
    throw new FederationDecodeError(
      `${path}.termsDigest: digest ${termsDigest} does not bind the stored terms (${recomputed})`,
    );
  }
  const acceptedBy = asArray(required(object, "acceptedBy", path), `${path}.acceptedBy`, FIXED_PEERS.length).map(
    (item, index) => decodeAcceptance(item, `${path}.acceptedBy[${index}]`),
  );
  const acceptedPeers = new Set<string>();
  for (const acceptance of acceptedBy) {
    if (acceptedPeers.has(acceptance.peer)) {
      throw new FederationDecodeError(`${path}.acceptedBy: duplicate acceptance for ${acceptance.peer}`);
    }
    // FED-INV-5: an acceptance is valid only for the exact current digest.
    if (acceptance.termsDigest !== termsDigest) {
      throw new FederationDecodeError(
        `${path}.acceptedBy: acceptance by ${acceptance.peer} is bound to a stale digest`,
      );
    }
    acceptedPeers.add(acceptance.peer);
  }
  const status = asEnum(required(object, "status", path), ["draft", "agreed"] as const, `${path}.status`);
  const proposedBy = asPeer(required(object, "proposedBy", path), `${path}.proposedBy`);
  const updatedBy = asPeer(required(object, "updatedBy", path), `${path}.updatedBy`);
  const updatedAt = asTimestamp(required(object, "updatedAt", path), `${path}.updatedAt`);
  return {
    schemaVersion: PAL_FED_SCHEMA_VERSION,
    contractId,
    participants: [...participants],
    title,
    terms,
    termsDigest,
    proposedBy,
    acceptedBy,
    status,
    updatedBy,
    updatedAt,
  };
}

export function encodeBoundaryContract(contract: BoundaryContract): JsonObject {
  return {
    schemaVersion: contract.schemaVersion,
    contractId: contract.contractId,
    participants: [...contract.participants],
    title: contract.title,
    terms: encodeTerms(contract.terms),
    termsDigest: contract.termsDigest,
    proposedBy: contract.proposedBy,
    acceptedBy: contract.acceptedBy.map((acceptance) => ({
      peer: acceptance.peer,
      termsDigest: acceptance.termsDigest,
      acceptedAt: acceptance.acceptedAt,
    })),
    status: contract.status,
    updatedBy: contract.updatedBy,
    updatedAt: contract.updatedAt,
  };
}

// --- PeerInboxState --------------------------------------------------------------

const PEERSTATE_KEYS = [
  "schemaVersion",
  "peer",
  "eventCursor",
  "contractCursor",
  "pending",
  "lastAckedBatchId",
] as const;

function decodeContractRevisionRef(value: unknown, path: string): { contractId: string; revision: number } {
  const object = asObject(value, path);
  exactKeys(object, ["contractId", "revision"], path);
  return {
    contractId: asString(required(object, "contractId", path), `${path}.contractId`, 1, ID_MAX_CHARS),
    revision: asPositiveRevision(required(object, "revision", path), `${path}.revision`),
  };
}

function decodePendingBatch(value: unknown, path: string): PendingBatch {
  const object = asObject(value, path);
  exactKeys(object, ["batchId", "eventNextCursor", "contractNextCursor", "eventIds", "contractRevisions"], path);
  const batchId = asString(required(object, "batchId", path), `${path}.batchId`, 1, ID_MAX_CHARS);
  const eventNextCursor = optionalString(object, "eventNextCursor", path, 1, 4_096);
  const contractNextCursor = optionalString(object, "contractNextCursor", path, 1, 4_096);
  const eventIds = asArray(required(object, "eventIds", path), `${path}.eventIds`, PENDING_ITEMS_MAX).map(
    (id, index) => asString(id, `${path}.eventIds[${index}]`, 1, ID_MAX_CHARS),
  );
  const contractRevisions = asArray(
    required(object, "contractRevisions", path),
    `${path}.contractRevisions`,
    PENDING_ITEMS_MAX,
  ).map((item, index) => decodeContractRevisionRef(item, `${path}.contractRevisions[${index}]`));
  return {
    batchId,
    ...(eventNextCursor === undefined ? {} : { eventNextCursor }),
    ...(contractNextCursor === undefined ? {} : { contractNextCursor }),
    eventIds,
    contractRevisions,
  };
}

export function decodePeerInboxState(value: unknown, path = "peerState"): PeerInboxState {
  const object = asObject(value, path);
  exactKeys(object, PEERSTATE_KEYS, path);
  const schemaVersion = asPositiveRevision(required(object, "schemaVersion", path), `${path}.schemaVersion`);
  if (schemaVersion !== PAL_FED_SCHEMA_VERSION) {
    throw new FederationDecodeError(`${path}.schemaVersion: expected ${PAL_FED_SCHEMA_VERSION}`);
  }
  const peer = asPeer(required(object, "peer", path), `${path}.peer`);
  const eventCursor = optionalString(object, "eventCursor", path, 1, 4_096);
  const contractCursor = optionalString(object, "contractCursor", path, 1, 4_096);
  const pendingRaw = optional(object, "pending");
  const pending = pendingRaw === undefined ? undefined : decodePendingBatch(pendingRaw, `${path}.pending`);
  const lastAckedBatchId = optionalString(object, "lastAckedBatchId", path, 1, ID_MAX_CHARS);
  return {
    schemaVersion: PAL_FED_SCHEMA_VERSION,
    peer,
    ...(eventCursor === undefined ? {} : { eventCursor }),
    ...(contractCursor === undefined ? {} : { contractCursor }),
    ...(pending === undefined ? {} : { pending }),
    ...(lastAckedBatchId === undefined ? {} : { lastAckedBatchId }),
  };
}

export function encodePeerInboxState(state: PeerInboxState): JsonObject {
  return {
    schemaVersion: state.schemaVersion,
    peer: state.peer,
    ...(state.eventCursor === undefined ? {} : { eventCursor: state.eventCursor }),
    ...(state.contractCursor === undefined ? {} : { contractCursor: state.contractCursor }),
    ...(state.pending === undefined
      ? {}
      : {
          pending: {
            batchId: state.pending.batchId,
            ...(state.pending.eventNextCursor === undefined
              ? {}
              : { eventNextCursor: state.pending.eventNextCursor }),
            ...(state.pending.contractNextCursor === undefined
              ? {}
              : { contractNextCursor: state.pending.contractNextCursor }),
            eventIds: [...state.pending.eventIds],
            contractRevisions: state.pending.contractRevisions.map((ref) => ({
              contractId: ref.contractId,
              revision: ref.revision,
            })),
          },
        }),
    ...(state.lastAckedBatchId === undefined ? {} : { lastAckedBatchId: state.lastAckedBatchId }),
  };
}

/** Cast a validated encoder output to Ordarium's JSON value domain. */
export function asOrdariumValue(value: JsonObject): JsonValue {
  return value;
}
